import { NextRequest, NextResponse } from 'next/server'
import { asc, inArray } from 'drizzle-orm'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders, orderItems, tables } from '@/lib/db/schema/tenant'

export async function GET(_: NextRequest) {
  await requireTenantSession()
  const tenant = await requireActiveTenant()

  const data = await withTenant(tenant.schemaName, async (db) => {
    const activeOrders = await db
      .select()
      .from(orders)
      .where(inArray(orders.status, ['sent', 'preparing'] as any))
      .orderBy(asc(orders.createdAt))

    if (activeOrders.length === 0) return []

    // Resolve table names
    const tableIds = Array.from(new Set(activeOrders.map((o) => o.tableId).filter(Boolean) as string[]))
    let tableNameMap: Record<string, string> = {}
    if (tableIds.length > 0) {
      const tableRows = await db.select({ id: tables.id, name: tables.name }).from(tables).where(inArray(tables.id, tableIds))
      tableNameMap = Object.fromEntries(tableRows.map((t) => [t.id, t.name]))
    }

    const allItems = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, activeOrders.map((o) => o.id)))

    const itemsByOrder: Record<string, typeof allItems> = {}
    for (const item of allItems) {
      if (!itemsByOrder[item.orderId]) itemsByOrder[item.orderId] = []
      itemsByOrder[item.orderId].push(item)
    }

    return activeOrders.map((o) => ({
      ...o,
      tableName: o.tableId ? (tableNameMap[o.tableId] ?? null) : null,
      items: itemsByOrder[o.id] ?? [],
    }))
  })

  return NextResponse.json({ data })
}
