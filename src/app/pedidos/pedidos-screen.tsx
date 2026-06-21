'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { calcOrderTotals } from '@/lib/order-calc'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { ModifiersModal } from '@/app/pos/modifiers-modal'
import {
  Plus, Minus, Trash2, Search, UtensilsCrossed, Truck, BarChart3,
  ChevronLeft, RefreshCw, LogOut, Clock, CheckCircle2,
} from 'lucide-react'
import type { CalcItem } from '@/lib/order-calc'
import type { PaymentMethodConfig } from '@/lib/payment-methods'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductWithModifiers {
  id: string
  name: string
  description?: string | null
  price: string
  categoryId: string
  taxRateId?: string | null
  taxRate: number
  taxName?: string | null
  isAvailable: boolean
  imageUrl?: string | null
  modifierGroups: {
    id: string
    name: string
    selectionType: string
    isRequired: boolean
    minSelections: number
    maxSelections?: number | null
    modifiers: { id: string; name: string; priceDelta: string; isDefault: boolean; sortOrder: number }[]
  }[]
}

interface DeliveryFields {
  phone: boolean
  address: boolean
  notes: boolean
  fee: boolean
}

interface Props {
  categories: { id: string; name: string; emoji?: string | null; color?: string | null }[]
  products: ProductWithModifiers[]
  tables: { id: string; name: string; zone: string; status: string; capacity: number }[]
  userId: string
  userName: string
  tenantName: string
  currencySign: string
  deliveryFields: DeliveryFields
  primaryColor: string
  role: string
  paymentMethods: PaymentMethodConfig[]
}

type OrderOrigin =
  | { type: 'table'; tableId: string; tableName: string }
  | { type: 'bar' }
  | { type: 'delivery'; customerName: string; customerPhone: string; customerAddress: string; customerNotes: string; deliveryFee: number }

interface LocalItem {
  id: string
  productId: string | null
  name: string
  unitPrice: number
  quantity: number
  modifiers: { groupName: string; modifierName: string; priceDelta: number }[]
  notes: string
}

interface LocalOrder {
  origin: OrderOrigin
  items: LocalItem[]
}

interface DBOrderItem {
  id: string
  status?: string | null
  quantity: number
  unitPrice: string
  itemTotal: string
  notes?: string | null
  productSnapshot: { name: string; price: string }
  modifierSnapshot: { groupName: string; modifierName: string; priceDelta: string | number }[]
}

interface DBOrder {
  id: string
  displayCode?: string | null
  type: 'table' | 'bar' | 'delivery'
  status: string
  tableId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  subtotal: string
  taxAmount: string
  taxBreakdown: { name: string; rate: number; amount: number }[]
  deliveryFee: string
  total: string
  createdAt: string
  itemsCount?: number
  items?: DBOrderItem[]
}

type View = 'list' | 'editing' | 'detail'
type OriginStep = 'main' | 'delivery'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badge: string; pulse?: boolean }> = {
  new:       { label: 'Nuevo',          badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  sent:      { label: 'En cocina',      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  preparing: { label: 'Preparando',     badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', pulse: true },
  ready:     { label: 'Listo ✓',        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', pulse: true },
  delivered: { label: 'Entregado',      badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
  closed:    { label: 'Finalizado',     badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  cancelled: { label: 'Anulado',        badge: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
}

function getOrderLabel(order: DBOrder, tables: Props['tables']): string {
  if (order.type === 'table') {
    return tables.find((t) => t.id === order.tableId)?.name ?? 'Mesa'
  }
  if (order.type === 'bar') return 'Barra'
  return order.customerName ?? 'Domicilio'
}

function getOriginLabel(origin: OrderOrigin): string {
  if (origin.type === 'table') return origin.tableName
  if (origin.type === 'bar') return 'Barra'
  return origin.customerName || 'Domicilio'
}

function getOriginIcon(type: string) {
  if (type === 'table') return <UtensilsCrossed className="h-4 w-4" />
  if (type === 'bar') return <BarChart3 className="h-4 w-4" />
  return <Truck className="h-4 w-4" />
}

function elapsedLabel(createdAt: string): string {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}


// ─── Main component ────────────────────────────────────────────────────────────

export function PedidosScreen({
  categories, products, tables, userId,
  userName, tenantName, currencySign, deliveryFields, primaryColor, role, paymentMethods,
}: Props) {
  const isMesero = role === 'mesero'
  const { toast } = useToast()
  const fmt = (n: number) => formatCurrency(n, currencySign)

  // ── View state
  const [view, setView] = useState<View>('list')
  const [dbOrders, setDbOrders] = useState<DBOrder[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // ── Editing state (local, before sending)
  const [localOrder, setLocalOrder] = useState<LocalOrder | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modifiersProduct, setModifiersProduct] = useState<ProductWithModifiers | null>(null)

  // ── Origin picker state
  const [showOriginPicker, setShowOriginPicker] = useState(false)
  const [originStep, setOriginStep] = useState<OriginStep>('main')
  const [deliveryForm, setDeliveryForm] = useState({
    customerName: '', customerPhone: '', customerAddress: '', customerNotes: '', deliveryFee: 0,
  })

  // ── Detail state (DB order)
  const [detailOrder, setDetailOrder] = useState<DBOrder | null>(null)

  // ── Pay modal state
  const [showPayModal, setShowPayModal] = useState(false)
  const [payingOrder, setPayingOrder] = useState<DBOrder | null>(null)
  const [payLines, setPayLines] = useState<{ method: string; amount: string }[]>([])
  const [payNotes, setPayNotes] = useState('')
  const [payCustomerName, setPayCustomerName] = useState('')
  const [paying, setPaying] = useState(false)

  // ── Custom product state
  const [showCustomProduct, setShowCustomProduct] = useState(false)
  const [customForm, setCustomForm] = useState({ name: '', price: '' })

  // ── Modifier modal context (which cart to add to)
  const [modifiersContext, setModifiersContext] = useState<'new' | 'add'>('new')

  // ── Add-to-order state
  const [showAddToOrder, setShowAddToOrder] = useState(false)
  const [addToOrderItems, setAddToOrderItems] = useState<LocalItem[]>([])
  const [addSearch, setAddSearch] = useState('')
  const [addCategory, setAddCategory] = useState<string | null>(null)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [addCustomForm, setAddCustomForm] = useState({ name: '', price: '' })
  const [submittingAdd, setSubmittingAdd] = useState(false)

  // ── Sending state
  const [sending, setSending] = useState(false)

  // ── Fetch orders ──────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/orders')
      if (!res.ok) return
      const json = await res.json()
      setDbOrders(json.data ?? [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 20000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  async function manualRefresh() {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }

  // ── Grouped orders ────────────────────────────────────────────────────────

  const readyOrders = useMemo(() => dbOrders.filter((o) => o.status === 'ready'), [dbOrders])
  const inProgressOrders = useMemo(
    () => dbOrders.filter((o) => ['sent', 'preparing', 'new'].includes(o.status)),
    [dbOrders],
  )
  const deliveredOrders = useMemo(() => dbOrders.filter((o) => o.status === 'delivered'), [dbOrders])

  // ── Catalog helpers ───────────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    let list = products
    if (selectedCategory) list = list.filter((p) => p.categoryId === selectedCategory)
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [products, selectedCategory, search])

  // ── Add-to-order catalog filter ───────────────────────────────────────────

  const addFilteredProducts = useMemo(() => {
    let list = products
    if (addCategory) list = list.filter((p) => p.categoryId === addCategory)
    if (addSearch) list = list.filter((p) => p.name.toLowerCase().includes(addSearch.toLowerCase()))
    return list
  }, [products, addCategory, addSearch])

  const addTotal = addToOrderItems.reduce(
    (s, i) => s + i.unitPrice * i.quantity + i.modifiers.reduce((ms, m) => ms + m.priceDelta, 0) * i.quantity,
    0,
  )

  // ── Cart totals ───────────────────────────────────────────────────────────

  const cartTotals = useMemo(() => {
    if (!localOrder || localOrder.items.length === 0) return null
    const cartItems: CalcItem[] = localOrder.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.name,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      modifiers: i.modifiers,
      notes: i.notes,
    }))
    const prodsForCalc = products.map((p) => ({
      id: p.id,
      taxRateId: p.taxRateId ?? null,
      taxRate: p.taxRate,
      taxName: p.taxName ?? null,
    }))
    const deliveryFee = localOrder.origin.type === 'delivery' ? localOrder.origin.deliveryFee : 0
    return calcOrderTotals(cartItems, prodsForCalc, { deliveryFee })
  }, [localOrder, products])

  // ── Actions ───────────────────────────────────────────────────────────────

  function openOriginPicker() {
    setOriginStep('main')
    setDeliveryForm({ customerName: '', customerPhone: '', customerAddress: '', customerNotes: '', deliveryFee: 0 })
    setShowOriginPicker(true)
  }

  function startOrder(origin: OrderOrigin) {
    setLocalOrder({ origin, items: [] })
    setShowOriginPicker(false)
    setView('editing')
  }

  function addItem(item: Omit<LocalItem, 'id'>) {
    setLocalOrder((prev) =>
      prev ? { ...prev, items: [...prev.items, { ...item, id: crypto.randomUUID() }] } : prev,
    )
  }

  function removeItem(id: string) {
    setLocalOrder((prev) => prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev)
  }

  function updateQty(id: string, delta: number) {
    setLocalOrder((prev) => {
      if (!prev) return prev
      const items = prev.items
        .map((i) => i.id === id ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
      return { ...prev, items }
    })
  }

  function handleProductTap(product: ProductWithModifiers) {
    if (product.modifierGroups.length > 0) {
      setModifiersContext('new')
      setModifiersProduct(product)
    } else {
      addItem({
        productId: product.id,
        name: product.name,
        unitPrice: parseFloat(product.price),
        quantity: 1,
        modifiers: [],
        notes: '',
      })
    }
  }

  async function sendToKitchen() {
    if (!localOrder || localOrder.items.length === 0) return
    setSending(true)
    try {
      const body = {
        type: localOrder.origin.type,
        ...(localOrder.origin.type === 'table' && { tableId: localOrder.origin.tableId }),
        ...(localOrder.origin.type === 'delivery' && {
          customerName: localOrder.origin.customerName,
          customerPhone: localOrder.origin.customerPhone,
          customerAddress: localOrder.origin.customerAddress,
          customerNotes: localOrder.origin.customerNotes,
          deliveryFee: localOrder.origin.deliveryFee,
        }),
        items: localOrder.items.map((i) => ({
          ...(i.productId
            ? { productId: i.productId }
            : { customName: i.name, customPrice: i.unitPrice }),
          quantity: i.quantity,
          notes: i.notes || undefined,
          modifiers: i.modifiers,
        })),
        localId: crypto.randomUUID(),
      }
      const res = await fetch('/api/tenant/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      // Update sent order to 'sent' status
      await fetch(`/api/tenant/orders/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      })
      toast({ variant: 'success', title: 'Pedido enviado a cocina' })
      setLocalOrder(null)
      setView('list')
      await fetchOrders()
    } catch {
      toast({ variant: 'destructive', title: 'Error al enviar el pedido' })
    } finally {
      setSending(false)
    }
  }

  async function markDelivered(orderId: string) {
    const found = dbOrders.find((o) => o.id === orderId)
    const label = found ? getOrderLabel(found, tables) : 'pedido'
    try {
      const res = await fetch(`/api/tenant/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      })
      if (!res.ok) throw new Error()
      toast({ variant: 'success', title: `${label} entregado` })
      if (detailOrder?.id === orderId) setDetailOrder((prev) => prev ? { ...prev, status: 'delivered' } : prev)
      await fetchOrders()
    } catch {
      toast({ variant: 'destructive', title: 'Error al actualizar' })
    }
  }

  async function changeStatus(orderId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/tenant/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      if (detailOrder?.id === orderId) setDetailOrder((prev) => prev ? { ...prev, status: newStatus } : prev)
      await fetchOrders()
    } catch {
      toast({ variant: 'destructive', title: 'Error al cambiar el estado' })
    }
  }

  async function openDetail(orderId: string) {
    try {
      const res = await fetch(`/api/tenant/orders/${orderId}`)
      if (!res.ok) return
      const { data } = await res.json()
      setDetailOrder(data)
      setView('detail')
    } catch { /* silent */ }
  }

  async function cancelOrderItem(orderId: string, itemId: string) {
    try {
      const res = await fetch(`/api/tenant/orders/${orderId}/items/${itemId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast({ variant: 'destructive', title: body.error ?? 'Error al cancelar el producto' })
        return
      }
      // Reload detail in-place
      const res2 = await fetch(`/api/tenant/orders/${orderId}`)
      if (res2.ok) {
        const { data } = await res2.json()
        setDetailOrder(data)
      }
      await fetchOrders()
      toast({ title: 'Producto cancelado' })
    } catch {
      toast({ variant: 'destructive', title: 'Error al cancelar el producto' })
    }
  }

  function openPayModal(order: DBOrder) {
    setPayingOrder(order)
    const total = String(parseFloat(order.total ?? '0'))
    setPayLines([{ method: paymentMethods[0]?.key ?? 'cash', amount: total }])
    setPayNotes('')
    setPayCustomerName(order.customerName ?? '')
    setShowPayModal(true)
  }

  async function confirmPay() {
    if (!payingOrder) return
    setPaying(true)
    try {
      const validPayments = payLines
        .filter((l) => l.amount && parseFloat(l.amount) > 0)
        .map((l) => ({ method: l.method, amount: parseFloat(l.amount) }))

      const firstMethod = validPayments[0]?.method
      const isCredit = !!(firstMethod && paymentMethods.find((m) => m.key === firstMethod)?.isCredit)

      const res = await fetch(`/api/tenant/orders/${payingOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          payments: validPayments,
          paymentNotes: payNotes || undefined,
          customerName: isCredit ? payCustomerName.trim() : undefined,
        }),
      })
      if (!res.ok) throw new Error()
      const label = getOrderLabel(payingOrder, tables)
      toast({ variant: 'success', title: `${label} — pago registrado`, description: 'Cobrado' })
      setShowPayModal(false)
      setPayingOrder(null)
      if (view === 'detail') setView('list')
      await fetchOrders()
    } catch {
      toast({ variant: 'destructive', title: 'Error al registrar el pago' })
    } finally {
      setPaying(false)
    }
  }

  function openAddToOrder() {
    setAddToOrderItems([])
    setAddSearch('')
    setAddCategory(null)
    setShowAddToOrder(true)
  }

  function addItemToAdd(item: Omit<LocalItem, 'id'>) {
    setAddToOrderItems((prev) => [...prev, { ...item, id: crypto.randomUUID() }])
  }

  function removeItemToAdd(id: string) {
    setAddToOrderItems((prev) => prev.filter((i) => i.id !== id))
  }

  function updateQtyToAdd(id: string, delta: number) {
    setAddToOrderItems((prev) =>
      prev.map((i) => i.id === id ? { ...i, quantity: i.quantity + delta } : i).filter((i) => i.quantity > 0)
    )
  }

  async function confirmAddToOrder() {
    if (!detailOrder || addToOrderItems.length === 0) return
    setSubmittingAdd(true)
    try {
      const res = await fetch(`/api/tenant/orders/${detailOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_items',
          items: addToOrderItems.map((i) => ({
            ...(i.productId ? { productId: i.productId } : { customName: i.name, customPrice: i.unitPrice }),
            quantity: i.quantity,
            notes: i.notes || undefined,
            modifiers: i.modifiers,
          })),
        }),
      })
      if (!res.ok) throw new Error()
      toast({ variant: 'success', title: 'Productos agregados al pedido' })
      setShowAddToOrder(false)
      await openDetail(detailOrder.id)
      await fetchOrders()
    } catch {
      toast({ variant: 'destructive', title: 'Error al agregar productos' })
    } finally {
      setSubmittingAdd(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  // aliases
  const orders = dbOrders

  // ── Pay modal totals ──────────────────────────────────────────────────────

  const paySubtotal = parseFloat(payingOrder?.subtotal ?? '0')
  const payTotal = parseFloat(payingOrder?.total ?? '0')
  const payTaxLines = payingOrder?.taxBreakdown ?? []
  const payDeliveryFee = parseFloat(payingOrder?.deliveryFee ?? '0')
  const payLinesValid = payLines.filter((l) => l.amount && parseFloat(l.amount) > 0)
  const totalReceived = payLinesValid.reduce((s, l) => s + parseFloat(l.amount), 0)
  const payChange = Math.max(0, totalReceived - payTotal)
  const payRemaining = Math.max(0, payTotal - totalReceived)
  const isPayCredit = !!(payLines[0] && paymentMethods.find((m) => m.key === payLines[0].method)?.isCredit)

  // ─────────────────────────────────────────────────────────────────────────────
  // Header (shared across all views)
  // ─────────────────────────────────────────────────────────────────────────────

  const Header = ({ onBack, title }: { onBack?: () => void; title?: string }) => (
    <div className="flex items-center h-14 px-4 border-b shrink-0 bg-background gap-3">
      {onBack ? (
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Pedidos
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            {tenantName.charAt(0)}
          </div>
          <span className="font-semibold text-sm">{tenantName}</span>
        </div>
      )}
      {title && <span className="text-sm font-medium flex-1">{title}</span>}
      {!title && <span className="flex-1" />}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground hidden sm:block">{userName}</span>
        <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // Order card (list view)
  // ─────────────────────────────────────────────────────────────────────────────

  function OrderCard({ order }: { order: DBOrder }) {
    const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.new
    const label = getOrderLabel(order, tables)
    const isSent = order.status === 'sent'
    const isPreparing = order.status === 'preparing'
    const isReady = order.status === 'ready'
    const isDelivered = order.status === 'delivered'

    return (
      <div
        className={`rounded-xl border bg-card p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow ${isReady ? 'border-emerald-400 ring-2 ring-emerald-200 dark:ring-emerald-900' : ''}`}
        onClick={() => openDetail(order.id)}
      >
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{getOriginIcon(order.type)}</span>
            <div>
              <span className="font-semibold text-base">{label}</span>
              {order.displayCode && (
                <span className="ml-2 text-xs font-mono text-muted-foreground">{order.displayCode}</span>
              )}
            </div>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge} ${cfg.pulse ? 'animate-pulse' : ''}`}>
            {order.type === 'delivery' && order.status === 'delivered' ? 'Al domiciliario' : cfg.label}
          </span>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{elapsedLabel(order.createdAt)}</span>
          {order.itemsCount != null && (
            <span className="ml-auto">{order.itemsCount} {order.itemsCount === 1 ? 'producto' : 'productos'}</span>
          )}
        </div>

        {/* Total */}
        <div className="text-lg font-bold">{fmt(parseFloat(order.total ?? '0'))}</div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {/* Sent: can advance to preparing or ready */}
          {isSent && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                onClick={() => changeStatus(order.id, 'preparing')}
              >
                Preparando
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                onClick={() => changeStatus(order.id, 'ready')}
              >
                Listo ✓
              </Button>
            </>
          )}

          {/* Preparing: can advance to ready */}
          {isPreparing && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              onClick={() => changeStatus(order.id, 'ready')}
            >
              Marcar listo ✓
            </Button>
          )}

          {/* Ready: deliver + pay */}
          {isReady && (
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => markDelivered(order.id)}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {order.type === 'delivery' ? 'Al domiciliario' : 'Entregar a mesa'}
            </Button>
          )}
          {(isDelivered || isReady) && (
            <Button
              size="sm"
              variant={isDelivered ? 'default' : 'outline'}
              className={isDelivered ? 'flex-1' : ''}
              onClick={() => openPayModal(order)}
            >
              Cobrar
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="flex flex-col h-full">
        {isMesero && Header({})}

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Pedidos activos</h1>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={manualRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={openOriginPicker} className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo pedido
              </Button>
            </div>
          </div>

          {/* Empty state */}
          {dbOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <UtensilsCrossed className="h-14 w-14 text-muted-foreground/30" />
              <p className="text-muted-foreground text-lg">Sin pedidos activos</p>
              <Button onClick={openOriginPicker} size="lg" className="gap-2 mt-2">
                <Plus className="h-5 w-5" />
                Crear primer pedido
              </Button>
            </div>
          )}

          {/* Ready — highest priority */}
          {readyOrders.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Listos para entregar
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {readyOrders.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            </section>
          )}

          {/* In progress */}
          {inProgressOrders.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">En proceso</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {inProgressOrders.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            </section>
          )}

          {/* Delivered */}
          {deliveredOrders.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Entregados</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {deliveredOrders.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            </section>
          )}
        </div>

        {/* Origin picker modal */}
        {OriginPickerModal()}

        {/* Pay modal */}
        {showPayModal && payingOrder && PayModal()}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EDITING VIEW (new local order)
  // ─────────────────────────────────────────────────────────────────────────────

  if (view === 'editing' && localOrder) {
    const origin = localOrder.origin
    const title = getOriginLabel(origin)

    return (
      <div className="flex flex-col h-full">
        {isMesero && Header({ onBack: () => { setLocalOrder(null); setView('list') }, title: `${title} — Nuevo pedido` })}

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-5">
          {/* Catalog panel */}
          <div className="lg:col-span-3 flex flex-col overflow-hidden border-r">
            {/* Search + categories */}
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    !selectedCategory ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                  }`}
                >
                  Todo
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategory(c.id === selectedCategory ? null : c.id)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap ${
                      selectedCategory === c.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                    }`}
                  >
                    {c.emoji ? `${c.emoji} ` : ''}{c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {filteredProducts.length === 0 && (
                <p className="text-center text-muted-foreground py-12 text-sm">Sin productos</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductTap(product)}
                    className="rounded-xl border bg-card p-3 text-left hover:border-primary hover:shadow-sm transition-all active:scale-95"
                  >
                    <div className="font-medium text-sm leading-snug mb-1">{product.name}</div>
                    <div className="text-base font-bold text-primary">
                      {fmt(parseFloat(product.price))}
                    </div>
                    {product.modifierGroups.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">Personalizable</div>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setCustomForm({ name: '', price: '' }); setShowCustomProduct(true) }}
                className="w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-3 text-left hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3"
              >
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Producto libre</p>
                  <p className="text-xs text-muted-foreground">Nombre y precio al momento</p>
                </div>
              </button>
            </div>
          </div>

          {/* Cart panel */}
          <div className="lg:col-span-2 flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center gap-2">
              {!isMesero && (
                <button
                  onClick={() => { setLocalOrder(null); setView('list') }}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Pedidos
                </button>
              )}
              <p className="font-semibold text-sm truncate">{title}</p>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {localOrder.items.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Toca un producto para añadirlo
                </p>
              )}
              {localOrder.items.map((item) => (
                <div key={item.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">{item.name}</p>
                      {item.modifiers.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.modifiers.map((m) => m.modifierName).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold shrink-0">
                      {fmt(item.unitPrice * item.quantity + item.modifiers.reduce((s, m) => s + m.priceDelta, 0) * item.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="ml-auto h-7 w-7 rounded-md border border-red-200 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals + action */}
            <div className="border-t p-3 space-y-3">
              {cartTotals && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span><span>{fmt(cartTotals.subtotal)}</span>
                  </div>
                  {cartTotals.taxLines.map((tl, i) => (
                    <div key={i} className="flex justify-between text-muted-foreground">
                      <span>{tl.name} ({tl.rate}%)</span><span>{fmt(tl.amount)}</span>
                    </div>
                  ))}
                  {cartTotals.deliveryFee > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Domicilio</span><span>{fmt(cartTotals.deliveryFee)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span><span>{fmt(cartTotals.total)}</span>
                  </div>
                </div>
              )}
              <Button
                className="w-full h-12 text-base font-semibold"
                disabled={localOrder.items.length === 0 || sending}
                onClick={sendToKitchen}
              >
                {sending ? 'Enviando...' : 'Enviar a cocina'}
              </Button>
            </div>
          </div>
        </div>

        {/* Modifiers modal */}
        {modifiersProduct && (
          <ModifiersModal
            product={modifiersProduct}
            currencySign={currencySign}
            onClose={() => setModifiersProduct(null)}
            onAdd={(item) => {
              const cartItem = {
                productId: item.productId,
                name: item.productName,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                modifiers: item.modifiers,
                notes: item.notes,
              }
              if (modifiersContext === 'add') {
                addItemToAdd(cartItem)
              } else {
                addItem(cartItem)
              }
              setModifiersProduct(null)
            }}
          />
        )}

        {/* Custom product dialog */}
        <Dialog open={showCustomProduct} onOpenChange={setShowCustomProduct}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Producto libre</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Descripción *</Label>
                <Input
                  autoFocus
                  value={customForm.name}
                  onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Sopa del día"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Precio *</Label>
                <Input
                  type="number"
                  min="0"
                  step="500"
                  value={customForm.price}
                  onChange={(e) => setCustomForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowCustomProduct(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  disabled={!customForm.name.trim() || !customForm.price || parseFloat(customForm.price) <= 0}
                  onClick={() => {
                    addItem({
                      productId: null,
                      name: customForm.name.trim(),
                      unitPrice: parseFloat(customForm.price),
                      quantity: 1,
                      modifiers: [],
                      notes: '',
                    })
                    setShowCustomProduct(false)
                  }}
                >
                  Agregar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DETAIL VIEW (DB order)
  // ─────────────────────────────────────────────────────────────────────────────

  if (view === 'detail' && detailOrder) {
    const cfg = STATUS_CONFIG[detailOrder.status] ?? STATUS_CONFIG.new
    const label = getOrderLabel(detailOrder, tables)
    const subtotal = parseFloat(detailOrder.subtotal ?? '0')
    const total = parseFloat(detailOrder.total ?? '0')
    const deliveryFee = parseFloat(detailOrder.deliveryFee ?? '0')
    const taxLines = detailOrder.taxBreakdown ?? []
    const isReady = detailOrder.status === 'ready'
    const isDelivered = detailOrder.status === 'delivered'
    const canPay = isReady || isDelivered

    return (
      <div className="flex flex-col h-full">
        {isMesero && Header({ onBack: () => setView('list') })}

        <div className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto p-4 space-y-4">
          {/* Back button for non-mesero (no header bar) */}
          {!isMesero && (
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Pedidos
            </button>
          )}

          {/* Order header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{getOriginIcon(detailOrder.type)}</span>
              <div>
                <h2 className="text-xl font-bold">{label}</h2>
                {detailOrder.displayCode && (
                  <span className="text-sm font-mono text-muted-foreground">{detailOrder.displayCode}</span>
                )}
              </div>
            </div>
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${cfg.badge} ${cfg.pulse ? 'animate-pulse' : ''}`}>
              {detailOrder.type === 'delivery' && detailOrder.status === 'delivered' ? 'Al domiciliario' : cfg.label}
            </span>
          </div>

          {/* Customer info */}
          {detailOrder.type === 'delivery' && (detailOrder.customerName || detailOrder.customerPhone) && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              {detailOrder.customerName && <p><span className="text-muted-foreground">Cliente:</span> {detailOrder.customerName}</p>}
              {detailOrder.customerPhone && <p><span className="text-muted-foreground">Tel:</span> {detailOrder.customerPhone}</p>}
            </div>
          )}

          {/* Items */}
          <div className="rounded-xl border overflow-hidden">
            <div className="p-3 border-b bg-muted/30">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Productos</p>
            </div>
            <div className="divide-y">
              {(detailOrder.items ?? []).map((item) => {
                const isCancelled = item.status === 'cancelled'
                const canCancelItem = !['closed', 'cancelled'].includes(detailOrder.status) && !isCancelled
                return (
                  <div key={item.id} className={`p-3 flex items-start justify-between gap-3 ${isCancelled ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
                        <span className="text-muted-foreground mr-1.5">{item.quantity}×</span>
                        {item.productSnapshot?.name}
                      </p>
                      {(item.modifierSnapshot ?? []).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.modifierSnapshot.map((m: any) => m.modifierName).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">"{item.notes}"</p>
                      )}
                      {isCancelled && (
                        <span className="text-xs text-red-500 font-medium">Cancelado</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-semibold ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
                        {fmt(parseFloat(item.itemTotal ?? '0'))}
                      </span>
                      {canCancelItem && (
                        <button
                          onClick={() => cancelOrderItem(detailOrder.id, item.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Cancelar este producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border p-4 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            {taxLines.map((tl, i) => (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span>{tl.name} ({tl.rate}%)</span><span>{fmt(tl.amount)}</span>
              </div>
            ))}
            {deliveryFee > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Domicilio</span><span>{fmt(deliveryFee)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span><span>{fmt(total)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            {isReady && (
              <Button
                className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold"
                onClick={() => markDelivered(detailOrder.id)}
              >
                <CheckCircle2 className="h-5 w-5 mr-2" />
                {detailOrder.type === 'delivery' ? 'Al domiciliario' : 'Entregar a mesa'}
              </Button>
            )}
            {canPay && (
              <Button
                variant={isDelivered ? 'default' : 'outline'}
                className={`h-12 text-base font-semibold ${isDelivered ? 'flex-1' : ''}`}
                onClick={() => openPayModal(detailOrder)}
              >
                Cobrar
              </Button>
            )}
            {detailOrder.status !== 'closed' && detailOrder.status !== 'cancelled' && (
              <Button
                variant="outline"
                className="h-12 gap-2"
                onClick={openAddToOrder}
              >
                <Plus className="h-4 w-4" />
                Agregar productos
              </Button>
            )}
          </div>
        </div>

        {showPayModal && payingOrder && PayModal()}
        {showAddToOrder && AddToOrderModal()}
        {modifiersProduct && (
          <ModifiersModal
            product={modifiersProduct}
            currencySign={currencySign}
            onClose={() => setModifiersProduct(null)}
            onAdd={(item) => {
              addItemToAdd({
                productId: item.productId,
                name: item.productName,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                modifiers: item.modifiers,
                notes: item.notes,
              })
              setModifiersProduct(null)
            }}
          />
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADD TO ORDER MODAL
  // ─────────────────────────────────────────────────────────────────────────────

  function AddToOrderModal() {
    return (
      <>
      <Dialog open={showAddToOrder} onOpenChange={(o) => { if (!o) setShowAddToOrder(false) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2 border-b">
            <DialogTitle>Agregar productos al pedido</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-5 min-h-0">
            {/* Catalog */}
            <div className="lg:col-span-3 flex flex-col overflow-hidden border-r">
              <div className="p-3 border-b space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar producto..."
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setAddCategory(null)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${!addCategory ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                  >
                    Todo
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setAddCategory(c.id === addCategory ? null : c.id)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap ${addCategory === c.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                    >
                      {c.emoji ? `${c.emoji} ` : ''}{c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {addFilteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => {
                        if (product.modifierGroups.length > 0) {
                          setModifiersContext('add')
                          setModifiersProduct(product)
                        } else {
                          addItemToAdd({ productId: product.id, name: product.name, unitPrice: parseFloat(product.price), quantity: 1, modifiers: [], notes: '' })
                        }
                      }}
                      className="rounded-xl border bg-card p-3 text-left hover:border-primary hover:shadow-sm transition-all active:scale-95"
                    >
                      <div className="font-medium text-sm leading-snug mb-1">{product.name}</div>
                      <div className="text-base font-bold text-primary">{fmt(parseFloat(product.price))}</div>
                      {product.modifierGroups.length > 0 && <div className="text-xs text-muted-foreground mt-1">Personalizable</div>}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setAddCustomForm({ name: '', price: '' }); setShowAddCustom(true) }}
                  className="mt-2 w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-3 text-left hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Producto libre</p>
                    <p className="text-xs text-muted-foreground">Nombre y precio al momento</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Mini-cart */}
            <div className="lg:col-span-2 flex flex-col overflow-hidden">
              <div className="p-3 border-b">
                <p className="font-semibold text-sm">A agregar</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {addToOrderItems.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">Toca un producto para añadirlo</p>
                )}
                {addToOrderItems.map((item) => (
                  <div key={item.id} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug flex-1 min-w-0 truncate">{item.name}</p>
                      <span className="text-sm font-semibold shrink-0">{fmt(item.unitPrice * item.quantity)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQtyToAdd(item.id, -1)} className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button onClick={() => updateQtyToAdd(item.id, 1)} className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeItemToAdd(item.id)} className="ml-auto h-7 w-7 rounded-md border border-red-200 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t p-3 space-y-3">
                {addTotal > 0 && (
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Subtotal a agregar</span><span>{fmt(addTotal)}</span>
                  </div>
                )}
                <Button
                  className="w-full h-11 font-semibold"
                  disabled={addToOrderItems.length === 0 || submittingAdd}
                  onClick={confirmAddToOrder}
                >
                  {submittingAdd ? 'Agregando...' : `Agregar ${addToOrderItems.length > 0 ? `(${addToOrderItems.length})` : ''} al pedido`}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom product dialog for add-to-order */}
      <Dialog open={showAddCustom} onOpenChange={setShowAddCustom}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Producto libre</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Descripción *</Label>
              <Input
                autoFocus
                value={addCustomForm.name}
                onChange={(e) => setAddCustomForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Sopa del día"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Precio *</Label>
              <Input
                type="number"
                min="0"
                step="500"
                value={addCustomForm.price}
                onChange={(e) => setAddCustomForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddCustom(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!addCustomForm.name.trim() || !addCustomForm.price || parseFloat(addCustomForm.price) <= 0}
                onClick={() => {
                  addItemToAdd({ productId: null, name: addCustomForm.name.trim(), unitPrice: parseFloat(addCustomForm.price), quantity: 1, modifiers: [], notes: '' })
                  setShowAddCustom(false)
                }}
              >
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ORIGIN PICKER MODAL
  // ─────────────────────────────────────────────────────────────────────────────

  function OriginPickerModal() {
    const zones = Array.from(new Set(tables.map((t) => t.zone)))

    return (
      <Dialog open={showOriginPicker} onOpenChange={setShowOriginPicker}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo pedido</DialogTitle>
          </DialogHeader>

          {originStep === 'main' ? (
            <div className="space-y-4">
              {/* Barra */}
              <button
                onClick={() => startOrder({ type: 'bar' })}
                className="w-full rounded-xl border-2 p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors flex items-center gap-4"
              >
                <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <BarChart3 className="h-6 w-6 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <p className="font-semibold text-base">Barra</p>
                  <p className="text-sm text-muted-foreground">Consumir en el mostrador</p>
                </div>
              </button>

              {/* Domicilio */}
              <button
                onClick={() => setOriginStep('delivery')}
                className="w-full rounded-xl border-2 p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors flex items-center gap-4"
              >
                <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                  <Truck className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-base">Domicilio</p>
                  <p className="text-sm text-muted-foreground">Pedido para entrega a domicilio</p>
                </div>
              </button>

              {/* Mesas */}
              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4" />
                  Selecciona una mesa
                </p>
                {zones.map((zone) => (
                  <div key={zone} className="mb-4">
                    <p className="text-xs text-muted-foreground uppercase mb-2">{zone}</p>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {tables.filter((t) => t.zone === zone).map((table) => {
                        const occupied = table.status === 'occupied'
                        return (
                          <button
                            key={table.id}
                            onClick={() => startOrder({ type: 'table', tableId: table.id, tableName: table.name })}
                            className={`rounded-xl border-2 p-3 text-center text-sm font-semibold transition-colors ${
                              occupied
                                ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400'
                                : 'hover:border-primary hover:bg-primary/5'
                            }`}
                          >
                            {table.name}
                            {occupied && <div className="text-xs font-normal opacity-70">Ocupada</div>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {tables.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin mesas configuradas</p>
                )}
              </div>
            </div>
          ) : (
            /* Delivery form */
            <div className="space-y-4">
              <button
                onClick={() => setOriginStep('main')}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Atrás
              </button>

              <div className={deliveryFields.phone ? 'grid grid-cols-2 gap-3' : ''}>
                <div className="space-y-1.5">
                  <Label>Nombre y apellido *</Label>
                  <Input
                    value={deliveryForm.customerName}
                    onChange={(e) => setDeliveryForm((f) => ({ ...f, customerName: e.target.value }))}
                    placeholder="Carlos López"
                  />
                </div>
                {deliveryFields.phone && (
                  <div className="space-y-1.5">
                    <Label>Teléfono</Label>
                    <Input
                      value={deliveryForm.customerPhone}
                      onChange={(e) => setDeliveryForm((f) => ({ ...f, customerPhone: e.target.value }))}
                      placeholder="311 234 5678"
                    />
                  </div>
                )}
              </div>

              {deliveryFields.address && (
                <div className="space-y-1.5">
                  <Label>Dirección</Label>
                  <Input
                    value={deliveryForm.customerAddress}
                    onChange={(e) => setDeliveryForm((f) => ({ ...f, customerAddress: e.target.value }))}
                    placeholder="Calle 50 #32-45"
                  />
                </div>
              )}

              {(deliveryFields.notes || deliveryFields.fee) && (
                <div className={deliveryFields.notes && deliveryFields.fee ? 'grid grid-cols-2 gap-3' : ''}>
                  {deliveryFields.notes && (
                    <div className="space-y-1.5">
                      <Label>Observaciones</Label>
                      <Input
                        value={deliveryForm.customerNotes}
                        onChange={(e) => setDeliveryForm((f) => ({ ...f, customerNotes: e.target.value }))}
                        placeholder="Tocar timbre"
                      />
                    </div>
                  )}
                  {deliveryFields.fee && (
                    <div className="space-y-1.5">
                      <Label>Valor domicilio ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={deliveryForm.deliveryFee}
                        onChange={(e) => setDeliveryForm((f) => ({ ...f, deliveryFee: Number(e.target.value) }))}
                      />
                    </div>
                  )}
                </div>
              )}

              <Button
                className="w-full"
                disabled={!deliveryForm.customerName.trim()}
                onClick={() =>
                  startOrder({
                    type: 'delivery',
                    customerName: deliveryForm.customerName,
                    customerPhone: deliveryForm.customerPhone,
                    customerAddress: deliveryForm.customerAddress,
                    customerNotes: deliveryForm.customerNotes,
                    deliveryFee: deliveryForm.deliveryFee,
                  })
                }
              >
                Continuar al pedido
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PAY MODAL
  // ─────────────────────────────────────────────────────────────────────────────

  function PayModal() {
    if (!payingOrder) return null
    const label = getOrderLabel(payingOrder, tables)

    return (
      <Dialog open={showPayModal} onOpenChange={(open) => { if (!open) { setShowPayModal(false); setPayingOrder(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cobrar — {label}</DialogTitle>
          </DialogHeader>

          {/* Order summary */}
          <div className="rounded-lg border p-3 space-y-1.5 text-sm bg-muted/30">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{fmt(paySubtotal)}</span>
            </div>
            {payTaxLines.map((tl, i) => (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span>{tl.name} ({tl.rate}%)</span><span>{fmt(tl.amount)}</span>
              </div>
            ))}
            {payDeliveryFee > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Domicilio</span><span>{fmt(payDeliveryFee)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-base">
              <span>Total a cobrar</span><span>{fmt(payTotal)}</span>
            </div>
          </div>

          {/* Payment lines */}
          <div className="space-y-2">
            <Label>Pagos recibidos</Label>
            {payLines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <Select
                  value={line.method}
                  onValueChange={(v) => setPayLines((ls) => ls.map((l, j) => j === i ? { ...l, method: v } : l))}
                >
                  <SelectTrigger className="w-40 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map(({ key, label: lbl }) => (
                      <SelectItem key={key} value={key}>{lbl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder={i === 0 ? fmt(payTotal) : '0'}
                  value={line.amount}
                  onChange={(e) => setPayLines((ls) => ls.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                />
                {payLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPayLines((ls) => ls.filter((_, j) => j !== i))}
                    className="shrink-0 p-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPayLines((ls) => [...ls, {
                method: paymentMethods[0]?.key ?? 'cash',
                amount: payRemaining > 0 ? String(payRemaining) : '',
              }])}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar otra forma de pago
            </button>
          </div>

          {/* Balance indicator */}
          <div className="rounded-lg border p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total recibido</span>
              <span className="font-medium">{fmt(totalReceived)}</span>
            </div>
            <Separator />
            {payChange > 0 && (
              <div className="flex justify-between font-semibold text-destructive">
                <span>Excede el total</span><span>{fmt(payChange)}</span>
              </div>
            )}
            {payRemaining > 0 && (
              <div className="flex justify-between font-semibold text-destructive">
                <span>Falta por cubrir</span><span>{fmt(payRemaining)}</span>
              </div>
            )}
            {payChange === 0 && payRemaining === 0 && totalReceived > 0 && (
              <div className="flex justify-between font-semibold text-emerald-600">
                <span>Cuadra exacto</span><span>✓</span>
              </div>
            )}
          </div>

          {/* Nombre del cliente — obligatorio para crédito */}
          {isPayCredit && (
            <div className="space-y-1.5">
              <Label>Nombre del cliente <span className="text-destructive">*</span></Label>
              <Input
                value={payCustomerName}
                onChange={(e) => setPayCustomerName(e.target.value)}
                placeholder="Nombre completo de quien debe"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>
              Observaciones
              {isPayCredit
                ? <span className="text-destructive"> *</span>
                : <span className="text-muted-foreground text-xs"> (opcional)</span>}
            </Label>
            <Input
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder={isPayCredit ? 'Motivo, plazo de pago, referencia...' : 'Referencia de transferencia, etc.'}
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setShowPayModal(false); setPayingOrder(null) }} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={confirmPay}
              disabled={
                paying ||
                payLinesValid.length === 0 ||
                payRemaining > 0 ||
                payChange > 0 ||
                (isPayCredit && (!payCustomerName.trim() || !payNotes.trim()))
              }
              className="flex-1"
            >
              {paying ? 'Procesando...' : isPayCredit ? 'Registrar deuda' : 'Confirmar cobro'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}
