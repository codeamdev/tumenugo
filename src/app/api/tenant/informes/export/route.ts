import { NextRequest, NextResponse } from 'next/server'
import { requireTenantSession } from '@/lib/auth/session'
import { requireActiveTenant } from '@/lib/tenant'
import { withTenant } from '@/lib/db/tenant-db'
import { orders } from '@/lib/db/schema/tenant'
import { and, eq, gte, lte } from 'drizzle-orm'
import ExcelJS from 'exceljs'

import { buildMethodLabels } from '@/lib/payment-methods'
import type { PosConfig } from '@/lib/db/schema/public'

function localDateStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

function endOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

export async function GET(req: NextRequest) {
  const session = await requireTenantSession()
  if (!['admin', 'cajero'].includes(session.role)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const tenant = await requireActiveTenant()

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get('from') ?? localDateStr()
  const toStr   = searchParams.get('to')   ?? localDateStr()
  const from = startOfDay(fromStr)
  const to   = endOfDay(toStr)

  const closedOrders = await withTenant(tenant.schemaName, async (db) =>
    db.select().from(orders).where(
      and(
        eq(orders.status, 'closed'),
        gte(orders.closedAt, from),
        lte(orders.closedAt, to)
      )
    )
  )

  const methodLabels = buildMethodLabels(tenant.posConfig as PosConfig | null)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CafeteriaOS'

  // ── Sheet 1: Pedidos ─────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Pedidos')
  ws.columns = [
    { header: 'Fecha/Hora', key: 'closedAt', width: 22 },
    { header: 'Tipo', key: 'type', width: 12 },
    { header: 'Estado pago', key: 'paymentStatus', width: 14 },
    { header: 'Método pago', key: 'paymentMethod', width: 16 },
    { header: 'Subtotal', key: 'subtotal', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Impuestos', key: 'taxAmount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Propina', key: 'tipAmount', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Domicilio', key: 'deliveryFee', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Total', key: 'total', width: 14, style: { numFmt: '#,##0.00' } },
  ]

  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' },
  }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }

  for (const o of closedOrders) {
    ws.addRow({
      closedAt: o.closedAt ? new Date(o.closedAt).toLocaleString('es-CO') : '',
      type: o.type,
      paymentStatus: o.paymentStatus ?? 'pending',
      paymentMethod: o.paymentMethod ? (methodLabels[o.paymentMethod] ?? o.paymentMethod) : '',
      subtotal: parseFloat(o.subtotal ?? '0'),
      taxAmount: parseFloat(o.taxAmount ?? '0'),
      tipAmount: parseFloat(o.tipAmount ?? '0'),
      deliveryFee: parseFloat(o.deliveryFee ?? '0'),
      total: parseFloat(o.total ?? '0'),
    })
  }

  // Totals row
  const lastRow = closedOrders.length + 2
  const totalsRow = ws.getRow(lastRow)
  totalsRow.getCell('closedAt').value = 'TOTALES'
  totalsRow.getCell('subtotal').value = closedOrders.reduce((s, o) => s + parseFloat(o.subtotal ?? '0'), 0)
  totalsRow.getCell('taxAmount').value = closedOrders.reduce((s, o) => s + parseFloat(o.taxAmount ?? '0'), 0)
  totalsRow.getCell('tipAmount').value = closedOrders.reduce((s, o) => s + parseFloat(o.tipAmount ?? '0'), 0)
  totalsRow.getCell('total').value = closedOrders.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0)
  totalsRow.font = { bold: true }

  // ── Sheet 2: Resumen ─────────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Resumen')
  ws2.addRow(['Métrica', 'Valor'])
  ws2.getRow(1).font = { bold: true }
  ws2.addRow(['Período', `${from.toLocaleDateString('es-CO')} – ${to.toLocaleDateString('es-CO')}`])
  ws2.addRow(['Total pedidos', closedOrders.length])
  ws2.addRow(['Ventas totales', closedOrders.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0)])
  ws2.addRow(['Ticket promedio', closedOrders.length > 0
    ? closedOrders.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0) / closedOrders.length : 0])
  ws2.addRow(['Total propinas', closedOrders.reduce((s, o) => s + parseFloat(o.tipAmount ?? '0'), 0)])
  ws2.columns = [{ key: 'a', width: 24 }, { key: 'b', width: 20 }]

  const buf = await wb.xlsx.writeBuffer()

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="informe-${from.toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
