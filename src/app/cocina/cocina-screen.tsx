'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { RefreshCw, ChefHat, UtensilsCrossed, Truck, BarChart3, Bell, LogOut } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KitchenItem {
  id: string
  quantity: number
  notes?: string | null
  productSnapshot: { name: string; price: string }
  modifierSnapshot: { groupName: string; modifierName: string; priceDelta: string | number }[]
}

interface KitchenOrder {
  id: string
  displayCode?: string | null
  type: 'table' | 'bar' | 'delivery'
  status: 'sent' | 'preparing'
  tableId?: string | null
  customerName?: string | null
  createdAt: string
  items: KitchenItem[]
}

interface Props {
  tenantName: string
  primaryColor: string
  tables: { id: string; name: string }[]
  userName: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsedInfo(createdAt: string): { label: string; urgency: 'normal' | 'warning' | 'urgent' } {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  const label = mins < 1 ? 'Ahora' : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`
  return {
    label,
    urgency: mins >= 15 ? 'urgent' : mins >= 8 ? 'warning' : 'normal',
  }
}

function getOrderLabel(order: KitchenOrder, tables: Props['tables']): string {
  if (order.type === 'table') return tables.find((t) => t.id === order.tableId)?.name ?? 'Mesa'
  if (order.type === 'bar') return 'Barra'
  return order.customerName ?? 'Domicilio'
}

function getOriginIcon(type: string) {
  if (type === 'table') return <UtensilsCrossed className="h-5 w-5" />
  if (type === 'bar') return <BarChart3 className="h-5 w-5" />
  return <Truck className="h-5 w-5" />
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.25
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.stop(ctx.currentTime + 0.4)
  } catch { /* audio not available */ }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CocinaScreen({ tenantName, primaryColor, tables, userName }: Props) {
  const { toast } = useToast()
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [time, setTime] = useState(new Date())
  const prevOrderIds = useRef<Set<string>>(new Set())
  const isFirstLoad = useRef(true)

  // Live clock (every second) — also re-renders elapsed time labels
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/kitchen')
      if (!res.ok) return
      const json = await res.json()
      const newOrders: KitchenOrder[] = json.data ?? []

      // Sound alert for new orders (skip first load)
      if (!isFirstLoad.current) {
        const hasNew = newOrders.some((o) => !prevOrderIds.current.has(o.id))
        if (hasNew) playBeep()
      }

      prevOrderIds.current = new Set(newOrders.map((o) => o.id))
      isFirstLoad.current = false
      setOrders(newOrders)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 10000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  async function manualRefresh() {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }

  async function changeStatus(orderId: string, newStatus: string) {
    // Optimistic update
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus as any } : o))
    try {
      const res = await fetch(`/api/tenant/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      // Remove from list when marked ready
      if (newStatus === 'ready') {
        setOrders((prev) => prev.filter((o) => o.id !== orderId))
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error al actualizar el pedido' })
      await fetchOrders() // revert
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const sentOrders = orders.filter((o) => o.status === 'sent')
  const preparingOrders = orders.filter((o) => o.status === 'preparing')

  const timeStr = time.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })

  // ── Order card (called as function to avoid remount) ──────────────────────

  function OrderCard(order: KitchenOrder) {
    const label = getOrderLabel(order, tables)
    const { label: timeLabel, urgency } = elapsedInfo(order.createdAt)
    const isPreparing = order.status === 'preparing'

    const urgencyClass =
      urgency === 'urgent' ? 'text-red-600 dark:text-red-400' :
      urgency === 'warning' ? 'text-amber-600 dark:text-amber-400' :
      'text-muted-foreground'

    const borderClass = isPreparing
      ? 'border-amber-400 dark:border-amber-600'
      : 'border-blue-400 dark:border-blue-700'

    return (
      <div key={order.id} className={`rounded-xl border-2 bg-card p-4 flex flex-col gap-3 ${borderClass}`}>
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">{getOriginIcon(order.type)}</span>
            <div>
              <span className="text-xl font-bold truncate">{label}</span>
              {order.displayCode && (
                <span className="ml-2 text-sm font-mono text-muted-foreground">{order.displayCode}</span>
              )}
            </div>
          </div>
          <div className={`flex items-center gap-1 text-sm font-semibold shrink-0 ${urgencyClass}`}>
            {urgency === 'urgent' && <span className="animate-pulse">⚡</span>}
            {timeLabel}
          </div>
        </div>

        {/* Items */}
        <div className="space-y-3 border-t pt-3">
          {order.items.map((item) => (
            <div key={item.id} className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums leading-none w-8 text-right" style={{ color: primaryColor }}>
                  {item.quantity}×
                </span>
                <span className="text-base font-semibold leading-snug">{item.productSnapshot?.name}</span>
              </div>
              {(item.modifierSnapshot ?? []).length > 0 && (
                <p className="text-sm text-muted-foreground ml-10">
                  + {item.modifierSnapshot.map((m) => m.modifierName).join(', ')}
                </p>
              )}
              {item.notes && (
                <p className="text-sm font-medium ml-10 text-amber-700 dark:text-amber-400 italic">
                  ⚠ {item.notes}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Action */}
        {!isPreparing ? (
          <Button
            className="w-full h-12 text-base font-bold bg-amber-500 hover:bg-amber-600 text-white border-0"
            onClick={() => changeStatus(order.id, 'preparing')}
          >
            Preparando
          </Button>
        ) : (
          <Button
            className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            onClick={() => changeStatus(order.id, 'ready')}
          >
            ✓ Listo
          </Button>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0 bg-background">
        <div
          className="h-7 w-7 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ backgroundColor: primaryColor }}
        >
          {tenantName.charAt(0)}
        </div>
        <ChefHat className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Cocina</span>
        <span className="text-muted-foreground text-sm hidden sm:block truncate">— {tenantName}</span>

        <div className="flex-1" />

        {sentOrders.length > 0 && (
          <div className="flex items-center gap-1.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold px-3 py-1 rounded-full animate-pulse shrink-0">
            <Bell className="h-3.5 w-3.5" />
            {sentOrders.length} nuevo{sentOrders.length > 1 ? 's' : ''}
          </div>
        )}

        <span className="text-sm font-mono text-muted-foreground shrink-0">{timeStr}</span>

        <Button variant="ghost" size="icon" onClick={manualRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>

        <span className="text-sm text-muted-foreground hidden md:block shrink-0">{userName}</span>
        <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {/* Empty state */}
      {orders.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <ChefHat className="h-20 w-20 text-muted-foreground/20" />
          <p className="text-2xl font-semibold text-muted-foreground">Sin pedidos pendientes</p>
          <p className="text-muted-foreground text-sm">Los pedidos aparecerán aquí cuando el mesero los envíe</p>
        </div>
      )}

      {/* Two-column KDS */}
      {orders.length > 0 && (
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 md:divide-x">
          {/* En espera (sent) */}
          <div className="flex flex-col overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between shrink-0">
              <span className="font-bold tracking-wide uppercase text-sm">En espera</span>
              <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                {sentOrders.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {sentOrders.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-12">Sin pedidos nuevos</p>
              ) : (
                sentOrders.map((o) => OrderCard(o))
              )}
            </div>
          </div>

          {/* Preparando */}
          <div className="flex flex-col overflow-hidden border-t md:border-t-0">
            <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between shrink-0">
              <span className="font-bold tracking-wide uppercase text-sm">Preparando</span>
              <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                {preparingOrders.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {preparingOrders.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-12">Sin pedidos en preparación</p>
              ) : (
                preparingOrders.map((o) => OrderCard(o))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
