'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { calcOrderTotals, type CalcItem, type OrderTotals } from '@/lib/order-calc'

// We use a lightweight state manager (zustand) per browser tab.
// No server state here — that's in the API.

export type OrderOrigin =
  | { type: 'table'; tableId: string; tableName: string }
  | { type: 'bar' }
  | { type: 'delivery'; customerName: string; customerPhone: string; customerAddress: string; customerNotes: string; deliveryFee: number }

export interface ActiveOrder {
  localId: string
  serverId?: string        // set after saving to server
  origin: OrderOrigin
  items: CalcItem[]
  notes: string
  tipPercent: number
  couponDiscount: number
  status: string
}

interface POSState {
  orders: ActiveOrder[]
  activeOrderId: string | null
  // actions
  newOrder: (origin: OrderOrigin) => string
  setActiveOrder: (id: string) => void
  addItem: (orderId: string, item: Omit<CalcItem, 'id'>) => void
  removeItem: (orderId: string, itemId: string) => void
  updateItemQty: (orderId: string, itemId: string, qty: number) => void
  updateItemNotes: (orderId: string, itemId: string, notes: string) => void
  setOrderNotes: (orderId: string, notes: string) => void
  setTipPercent: (orderId: string, pct: number) => void
  closeOrder: (orderId: string) => void
  setServerId: (orderId: string, serverId: string) => void
}

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      orders: [],
      activeOrderId: null,

      newOrder: (origin) => {
        const localId = crypto.randomUUID()
        set((s) => ({
          orders: [
            ...s.orders,
            {
              localId,
              origin,
              items: [],
              notes: '',
              tipPercent: 0,
              couponDiscount: 0,
              status: 'new',
            },
          ],
          activeOrderId: localId,
        }))
        return localId
      },

      setActiveOrder: (id) => set({ activeOrderId: id }),

      addItem: (orderId, item) =>
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.localId !== orderId) return o
            // Merge if same product and no modifiers on either side
            const noMods = item.modifiers.length === 0
            const existing = noMods
              ? o.items.find((i) => i.productId === item.productId && i.modifiers.length === 0)
              : null
            if (existing) {
              return {
                ...o,
                items: o.items.map((i) =>
                  i.id === existing.id ? { ...i, quantity: i.quantity + item.quantity } : i
                ),
              }
            }
            return { ...o, items: [...o.items, { ...item, id: crypto.randomUUID() }] }
          }),
        })),

      removeItem: (orderId, itemId) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.localId === orderId
              ? { ...o, items: o.items.filter((i) => i.id !== itemId) }
              : o
          ),
        })),

      updateItemQty: (orderId, itemId, qty) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.localId === orderId
              ? {
                  ...o,
                  items:
                    qty <= 0
                      ? o.items.filter((i) => i.id !== itemId)
                      : o.items.map((i) => (i.id === itemId ? { ...i, quantity: qty } : i)),
                }
              : o
          ),
        })),

      updateItemNotes: (orderId, itemId, notes) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.localId === orderId
              ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, notes } : i)) }
              : o
          ),
        })),

      setOrderNotes: (orderId, notes) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.localId === orderId ? { ...o, notes } : o)),
        })),

      setTipPercent: (orderId, tipPercent) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.localId === orderId ? { ...o, tipPercent } : o)),
        })),

      closeOrder: (orderId) =>
        set((s) => ({
          orders: s.orders.filter((o) => o.localId !== orderId),
          activeOrderId:
            s.activeOrderId === orderId
              ? (s.orders.find((o) => o.localId !== orderId)?.localId ?? null)
              : s.activeOrderId,
        })),

      setServerId: (orderId, serverId) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.localId === orderId ? { ...o, serverId } : o
          ),
        })),
    }),
    {
      name: 'cafeteria-pos',
      partialize: (s) => ({ orders: s.orders, activeOrderId: s.activeOrderId }),
    }
  )
)
