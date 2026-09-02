'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { ModifiersModal } from '@/app/pos/modifiers-modal'
import {
  Plus, Trash2, Search, UtensilsCrossed, Truck, BarChart3, ShoppingBag,
  ChevronLeft, RefreshCw, LogOut, Clock, CheckCircle2, Minus, SlidersHorizontal,
} from 'lucide-react'
import type { PaymentMethodConfig } from '@/lib/payment-methods'

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

interface LocalItem {
  id: string
  productId: string | null
  name: string
  unitPrice: number
  quantity: number
  modifiers: { groupName: string; modifierName: string; priceDelta: number }[]
  notes: string
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
  type: 'table' | 'bar' | 'delivery' | 'takeout'
  status: string
  tableId?: string | null
  tableName?: string | null
  customerName?: string | null
  customerPhone?: string | null
  subtotal: string
  taxAmount: string
  taxBreakdown: { name: string; rate: number; amount: number }[]
  deliveryFee: string
  total: string
  notes?: string | null
  createdAt: string
  closedAt?: string | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  paymentNotes?: string | null
  itemsCount?: number
  items?: DBOrderItem[]
}

type View = 'list' | 'historial' | 'detail'
type ListTab = 'activos' | 'historial'

// â"€â"€â"€ Status config â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const STATUS_CONFIG: Record<string, { label: string; badge: string; pulse?: boolean }> = {
  new:       { label: 'Nuevo',          badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  sent:      { label: 'En cocina',      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  preparing: { label: 'Preparando',     badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  ready:     { label: 'Listo ✓',          badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  delivered: { label: 'Entregado',      badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
  closed:    { label: 'Finalizado',     badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  cancelled: { label: 'Anulado',        badge: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
}

function getOrderLabel(order: DBOrder, tables: Props['tables']): string {
  if (order.type === 'table') {
    const name = order.tableName ?? tables.find((t) => t.id === order.tableId)?.name
    return name ? `Mesa ${name}` : 'Mesa'
  }
  if (order.type === 'bar') return 'Barra'
  if (order.type === 'takeout') return 'Para llevar'
  return order.customerName ?? 'Domicilio'
}

function getOriginIcon(type: string) {
  if (type === 'table') return <UtensilsCrossed className="h-4 w-4" />
  if (type === 'bar') return <BarChart3 className="h-4 w-4" />
  if (type === 'takeout') return <ShoppingBag className="h-4 w-4" />
  return <Truck className="h-4 w-4" />
}

function elapsedLabel(createdAt: string): string {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}


// â"€â"€â"€ Main component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function PedidosScreen({
  categories, products, tables, userId,
  userName, tenantName, currencySign, deliveryFields, primaryColor, role, paymentMethods,
}: Props) {
  const isMesero = role === 'mesero'
  const { toast } = useToast()
  const fmt = (n: number) => formatCurrency(n, currencySign)

  // â"€â"€ View state
  const [view, setView] = useState<View>('list')
  const [listTab, setListTab] = useState<ListTab>('activos')
  const [dbOrders, setDbOrders] = useState<DBOrder[]>([])
  const [historialOrders, setHistorialOrders] = useState<DBOrder[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  // Historial filters
  const todayStr = new Date().toISOString().slice(0, 10)
  const [hDateFrom, setHDateFrom] = useState(todayStr)
  const [hDateTo,   setHDateTo]   = useState(todayStr)
  const [hMethod,   setHMethod]   = useState('')
  const [hType,     setHType]     = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  // â"€â"€ Modifiers modal (for add-to-order)
  const [modifiersProduct, setModifiersProduct] = useState<ProductWithModifiers | null>(null)

  // â"€â"€ Detail state (DB order)
  const [detailOrder, setDetailOrder] = useState<DBOrder | null>(null)

  // â"€â"€ Notes editing
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    setNotesDraft(detailOrder?.notes ?? '')
  }, [detailOrder?.id])

  async function saveNotes() {
    if (!detailOrder) return
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/tenant/orders/${detailOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft }),
      })
      if (!res.ok) { toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' }); return }
      setDetailOrder((prev) => prev ? { ...prev, notes: notesDraft } : prev)
      toast({ title: 'Nota guardada' })
    } finally { setSavingNotes(false) }
  }

  // â"€â"€ Pay modal state
  const [showPayModal, setShowPayModal] = useState(false)
  const [payingOrder, setPayingOrder] = useState<DBOrder | null>(null)
  const [payLines, setPayLines] = useState<{ method: string; amount: string }[]>([])
  const [payNotes, setPayNotes] = useState('')
  const [payCustomerName, setPayCustomerName] = useState('')
  const [paying, setPaying] = useState(false)

  // -- Edit payment state
  const [showEditPay, setShowEditPay] = useState(false)
  const [editPayLines, setEditPayLines] = useState<{ method: string; amount: string }[]>([])
  const [editPayNotes, setEditPayNotes] = useState('')
  const [savingEditPay, setSavingEditPay] = useState(false)

  // â"€â"€ Add-to-order state
  const [showAddToOrder, setShowAddToOrder] = useState(false)
  const [addToOrderItems, setAddToOrderItems] = useState<LocalItem[]>([])
  const [addSearch, setAddSearch] = useState('')
  const [addCategory, setAddCategory] = useState<string | null>(null)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [addCustomForm, setAddCustomForm] = useState({ name: '', price: '' })
  const [submittingAdd, setSubmittingAdd] = useState(false)

  // â"€â"€ Fetch orders â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  const fetchHistorial = useCallback(async (from?: string, to?: string) => {
    setLoadingHistorial(true)
    try {
      const f = from ?? hDateFrom
      const t = to   ?? hDateTo
      const res = await fetch(`/api/tenant/orders?historial=true&from=${f}&to=${t}`)
      if (!res.ok) return
      const json = await res.json()
      setHistorialOrders(json.data ?? [])
    } catch { /* silent */ } finally { setLoadingHistorial(false) }
  }, [hDateFrom, hDateTo])

  useEffect(() => {
    if (listTab === 'historial') fetchHistorial()
  }, [listTab, fetchHistorial])

  const filteredHistorial = useMemo(() => {
    return historialOrders.filter((o) => {
      if (hMethod && o.paymentMethod !== hMethod) return false
      if (hType && o.type !== hType) return false
      return true
    })
  }, [historialOrders, hMethod, hType])

  // â"€â"€ Grouped orders â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const readyOrders = useMemo(() => dbOrders.filter((o) => o.status === 'ready'), [dbOrders])
  const inProgressOrders = useMemo(
    () => dbOrders.filter((o) => ['sent', 'preparing', 'new'].includes(o.status)),
    [dbOrders],
  )
  const deliveredOrders = useMemo(() => dbOrders.filter((o) => o.status === 'delivered'), [dbOrders])

  // â"€â"€ Add-to-order catalog filter â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  // â"€â"€ Actions â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  // â"€â"€ Pay modal totals â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const paySubtotal = parseFloat(payingOrder?.subtotal ?? '0')
  const payTotal = parseFloat(payingOrder?.total ?? '0')
  const payTaxLines = payingOrder?.taxBreakdown ?? []
  const payDeliveryFee = parseFloat(payingOrder?.deliveryFee ?? '0')
  const payLinesValid = payLines.filter((l) => l.amount && parseFloat(l.amount) > 0)
  const totalReceived = payLinesValid.reduce((s, l) => s + parseFloat(l.amount), 0)
  const payChange = Math.max(0, totalReceived - payTotal)
  const payRemaining = Math.max(0, payTotal - totalReceived)
  const isPayCredit = !!(payLines[0] && paymentMethods.find((m) => m.key === payLines[0].method)?.isCredit)

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Header (shared across all views)
  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Order card (list view)
  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-xl leading-tight">{label}</span>
            {order.displayCode && (
              <span className="text-xs font-mono text-muted-foreground">{order.displayCode}</span>
            )}
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

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // LIST VIEW
  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  if (view === 'list') {
    return (
      <div className="flex flex-col h-full">
        {isMesero && Header({})}

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setListTab('activos')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  listTab === 'activos'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Activos
              </button>
              <button
                onClick={() => setListTab('historial')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  listTab === 'historial'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Historial
              </button>
            </div>
            <div className="flex items-center gap-1">
              {listTab === 'historial' && (
                <Button
                  variant="ghost" size="icon"
                  onClick={() => setFilterOpen((v) => !v)}
                  className="relative"
                >
                  <SlidersHorizontal className={`h-4 w-4 ${filterOpen ? 'text-primary' : ''}`} />
                  {(hMethod || hType) && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost" size="icon"
                onClick={() => listTab === 'activos' ? manualRefresh() : fetchHistorial()}
                disabled={refreshing || loadingHistorial}
              >
                <RefreshCw className={`h-4 w-4 ${(refreshing || loadingHistorial) ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Panel de filtros historial */}
          {listTab === 'historial' && filterOpen && (
            <div className="border rounded-xl p-4 space-y-4 bg-muted/30">
              <div className="flex gap-3 flex-wrap items-end">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Desde</label>
                  <input
                    type="date"
                    value={hDateFrom}
                    max={hDateTo}
                    onChange={(e) => { setHDateFrom(e.target.value); fetchHistorial(e.target.value, hDateTo) }}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                  <input
                    type="date"
                    value={hDateTo}
                    min={hDateFrom}
                    onChange={(e) => { setHDateTo(e.target.value); fetchHistorial(hDateFrom, e.target.value) }}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Forma de pago</p>
                <div className="flex flex-wrap gap-2">
                  {[{ key: '', label: 'Todas' }, ...paymentMethods].map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setHMethod(m.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${hMethod === m.key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                    >{m.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo de pedido</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: '', label: 'Todos' },
                    { key: 'table', label: 'Mesa' },
                    { key: 'bar', label: 'Barra' },
                    { key: 'delivery', label: 'Domicilio' },
                    { key: 'takeout', label: 'Para llevar' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setHType(f.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${hType === f.key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                    >{f.label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVOS */}
          {listTab === 'activos' && (
            <>
              {dbOrders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                  <UtensilsCrossed className="h-14 w-14 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-lg">Sin pedidos activos</p>
                </div>
              )}
              {readyOrders.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      Listos para entregar
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {readyOrders.map((o) => <OrderCard key={o.id} order={o} />)}
                  </div>
                </section>
              )}
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
            </>
          )}

          {/* HISTORIAL */}
          {listTab === 'historial' && (
            <>

              {loadingHistorial && (
                <div className="flex justify-center py-20">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loadingHistorial && filteredHistorial.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                  <Clock className="h-14 w-14 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-lg">Sin historial</p>
                </div>
              )}
              {!loadingHistorial && filteredHistorial.length > 0 && (
                <div className="space-y-2">
                  {filteredHistorial.map((o) => {
                    const label = getOrderLabel(o, tables)
                    const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.closed
                    return (
                      <div
                        key={o.id}
                        onClick={() => openDetail(o.id)}
                        className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <span className="text-muted-foreground">{getOriginIcon(o.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{label}</span>
                            {o.displayCode && (
                              <span className="text-xs font-mono text-muted-foreground">{o.displayCode}</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {o.closedAt ? new Date(o.closedAt).toLocaleString('es-CO') : elapsedLabel(o.createdAt)}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-bold text-sm">{fmt(parseFloat(o.total ?? '0'))}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                          {o.paymentMethod && (
                            <span className="text-xs text-muted-foreground">
                              {paymentMethods.find((m) => m.key === o.paymentMethod)?.label ?? o.paymentMethod}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Pay modal */}
        {showPayModal && payingOrder && PayModal()}
      </div>
    )
  }

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // DETAIL VIEW (DB order)
  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  if (view === 'detail' && detailOrder) {
    const cfg = STATUS_CONFIG[detailOrder.status] ?? STATUS_CONFIG.new
    const label = getOrderLabel(detailOrder, tables)
    const subtotal = parseFloat(detailOrder.subtotal ?? '0')
    const total = parseFloat(detailOrder.total ?? '0')
    const deliveryFee = parseFloat(detailOrder.deliveryFee ?? '0')
    const taxLines = detailOrder.taxBreakdown ?? []
    const isReady = detailOrder.status === 'ready'
    const isDelivered = detailOrder.status === 'delivered'
    const canPay = detailOrder.status === 'delivered'

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

          {/* Notes */}
          {!['closed', 'cancelled'].includes(detailOrder.status) && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Notas del pedido</Label>
              <div className="flex gap-2">
                <Input
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Sin notas"
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && saveNotes()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveNotes}
                  disabled={savingNotes || notesDraft === (detailOrder.notes ?? '')}
                >
                  {savingNotes ? '...' : 'Guardar'}
                </Button>
              </div>
            </div>
          )}
          {['closed', 'cancelled'].includes(detailOrder.status) && detailOrder.notes && (
            <p className="text-sm text-muted-foreground italic">"{detailOrder.notes}"</p>
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
            {detailOrder.status === 'closed' && detailOrder.paymentStatus !== 'pending' && role === 'admin' && (
              <Button
                variant="outline"
                className="h-12 gap-2"
                onClick={() => {
                  setEditPayLines([{ method: detailOrder.paymentMethod ?? 'cash', amount: String(parseFloat(detailOrder.total ?? '0')) }])
                  setEditPayNotes(detailOrder.paymentNotes ?? '')
                  setShowEditPay(true)
                }}
              >
                Editar pago
              </Button>
            )}
          </div>
        </div>

        {showPayModal && payingOrder && PayModal()}
        {showAddToOrder && AddToOrderModal()}

        {/* Edit payment modal */}
        <Dialog open={showEditPay} onOpenChange={(o) => { if (!o) setShowEditPay(false) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar forma de pago</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {editPayLines.map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={line.method} onValueChange={(v) => setEditPayLines((prev) => prev.map((l, j) => j === i ? { ...l, method: v } : l))}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={line.amount}
                    onChange={(e) => setEditPayLines((prev) => prev.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                    className="flex-1"
                    placeholder="Monto"
                  />
                  {editPayLines.length > 1 && (
                    <button onClick={() => setEditPayLines((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <Minus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setEditPayLines((prev) => [...prev, { method: paymentMethods[0]?.key ?? 'cash', amount: '' }])}>
                <Plus className="h-4 w-4 mr-1" /> Agregar método
              </Button>
              <div>
                <Label className="text-xs text-muted-foreground">Notas de pago (opcional)</Label>
                <Input value={editPayNotes} onChange={(e) => setEditPayNotes(e.target.value)} placeholder="Observaciones" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditPay(false)}>Cancelar</Button>
              <Button
                className="flex-1"
                disabled={savingEditPay}
                onClick={async () => {
                  if (!detailOrder) return
                  setSavingEditPay(true)
                  try {
                    const payments = editPayLines
                      .filter((l) => parseFloat(l.amount) > 0)
                      .map((l) => ({ method: l.method, amount: parseFloat(l.amount) }))
                    const res = await fetch(`/api/tenant/orders/${detailOrder.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'update_payment', payments, paymentNotes: editPayNotes || undefined }),
                    })
                    const json = await res.json()
                    if (!res.ok) { toast({ title: 'Error', description: json.error, variant: 'destructive' }); return }
                    setDetailOrder((prev) => prev ? { ...prev, paymentMethod: json.data.paymentMethod, paymentNotes: json.data.paymentNotes } : prev)
                    setShowEditPay(false)
                    toast({ title: 'Pago actualizado' })
                  } finally { setSavingEditPay(false) }
                }}
              >
                {savingEditPay ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // ADD TO ORDER MODAL
  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
                  <p className="text-center text-muted-foreground text-sm py-8">Toca un producto para aÃ±adirlo</p>
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


  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // PAY MODAL
  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

          {/* Montos rápidos */}
          <div className="space-y-1.5">
            <Label>Monto rápido</Label>
            <div className="flex flex-wrap gap-2">
              {[10000, 20000, 50000, 100000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setPayLines((ls) => ls.map((l, i) => i === 0 ? { ...l, amount: String(amt) } : l))}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-primary text-primary hover:bg-primary/10 transition-colors"
                >
                  +{amt >= 1000 ? `${amt / 1000}k` : amt}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPayLines((ls) => ls.map((l, i) => i === 0 ? { ...l, amount: String(payTotal) } : l))}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-primary text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              >
                Exacto
              </button>
            </div>
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
