import { NextRequest, NextResponse } from 'next/server'
import { sql, gte, lte, and } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { purchases } from '@/lib/db/schema/tenant'

function dateRange(from: string, to: string) {
  return and(
    gte(purchases.purchasedAt, new Date(from + 'T00:00:00Z')),
    lte(purchases.purchasedAt, new Date(to  + 'T23:59:59Z'))
  )
}

export async function GET(req: NextRequest) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()
  const { searchParams } = new URL(req.url)

  const todayStr = new Date().toISOString().slice(0, 10)
  const from = searchParams.get('from') ?? todayStr
  const to   = searchParams.get('to')   ?? todayStr

  // Previous period same duration
  const fromDate = new Date(from + 'T00:00:00Z')
  const toDate   = new Date(to   + 'T23:59:59Z')
  const days     = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1
  const prevTo   = new Date(fromDate.getTime() - 86400000)
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000)
  const prevFromStr = prevFrom.toISOString().slice(0, 10)
  const prevToStr   = prevTo.toISOString().slice(0, 10)

  const data = await withTenant(tenant.schemaName, async (db) => {
    const [currentRows, prevRows, byProductRows, dailyRows] = await Promise.all([
      // Current period KPIs
      db.select({
        total: sql<string>`COALESCE(SUM(value), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(purchases).where(dateRange(from, to)),

      // Previous period KPIs
      db.select({
        total: sql<string>`COALESCE(SUM(value), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(purchases).where(dateRange(prevFromStr, prevToStr)),

      // By product
      db.select({
        productName: purchases.productName,
        total: sql<string>`SUM(value)`,
        count: sql<string>`COUNT(*)`,
      })
        .from(purchases)
        .where(dateRange(from, to))
        .groupBy(purchases.productName)
        .orderBy(sql`SUM(value) DESC`)
        .limit(20),

      // Daily series
      db.select({
        date: sql<string>`purchased_at::date`,
        total: sql<string>`SUM(value)`,
        count: sql<string>`COUNT(*)`,
      })
        .from(purchases)
        .where(dateRange(from, to))
        .groupBy(sql`purchased_at::date`)
        .orderBy(sql`purchased_at::date`),
    ])

    const currentTotal = parseFloat(currentRows[0]?.total ?? '0')
    const prevTotal    = parseFloat(prevRows[0]?.total ?? '0')
    const growthPct    = prevTotal === 0 ? null : ((currentTotal - prevTotal) / prevTotal) * 100

    return {
      period: { from, to },
      currencySign: tenant.currencySign ?? '$',
      kpis: {
        total:         currentTotal,
        count:         parseInt(currentRows[0]?.count ?? '0'),
        average:       parseInt(currentRows[0]?.count ?? '0') > 0 ? currentTotal / parseInt(currentRows[0].count) : 0,
        totalPrevious: prevTotal,
        countPrevious: parseInt(prevRows[0]?.count ?? '0'),
        growthPercent: growthPct,
      },
      byProduct: byProductRows.map((r) => ({
        name:    r.productName,
        total:   parseFloat(r.total),
        count:   parseInt(r.count),
        average: parseInt(r.count) > 0 ? parseFloat(r.total) / parseInt(r.count) : 0,
      })),
      dailySeries: dailyRows.map((r) => ({
        date:  r.date,
        total: parseFloat(r.total),
        count: parseInt(r.count),
      })),
    }
  })

  return NextResponse.json({ data })
}
