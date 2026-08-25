'use client'

import { useState, useMemo, useRef } from 'react'
import { usePOSStore, type ActiveOrder, type OrderOrigin } from './pos-store'
import { calcOrderTotals, calcChange } from '@/lib/order-calc'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ModifiersModal } from './modifiers-modal'
import { FlavorsModal } from './flavors-modal'
import { NewOrderModal } from './new-order-modal'
import { CloseOrderModal } from './close-order-modal'
import { useToast } from '@/components/ui/use-toast'
import {
  Plus, Minus, Trash2, ShoppingCart, Search,
  UtensilsCrossed, Truck, BarChart3, ChevronLeft,
} from 'lucide-react'
import { OfflineIndicator } from '@/components/offline-indicator'
import type { PaymentMethodConfig } from '@/lib/payment-methods'

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
  inStock: boolean
  imageUrl?: string | null
  flavors: string[]
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
  taxRates: { id: string; name: string; rate: string }[]
  userId: string
  tenantName: string
  currencySign: string
  deliveryFields?: DeliveryFields
  paymentMethods: PaymentMethodConfig[]
  defaultDeliveryFee?: number
  barEnabled?: boolean
}

export function POSScreen({ categories, products, tables, userId, tenantName, currencySign, deliveryFields, paymentMethods, defaultDeliveryFee = 0, barEnabled = false }: Props) {
  const { toast } = useToast()
  const store = usePOSStore()

  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [modifiersProduct, setModifiersProduct] = useState<ProductWithModifiers | null>(null)
  const [flavorsProduct,   setFlavorsProduct]   = useState<ProductWithModifiers | null>(null)
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog')
  const [tablesPanelOpen, setTablesPanelOpen] = useState(false)

  function quickCreateBar() {
    store.newOrder({ type: 'bar' })
    setMobileTab('cart')
  }

  function quickCreateOrSelectTable(table: { id: string; name: string }) {
    const existing = store.orders.find(
      (o) => o.origin.type === 'table' && o.origin.tableId === table.id
    )
    if (existing) {
      store.setActiveOrder(existing.localId)
      setMobileTab('cart')
    } else {
      store.newOrder({ type: 'table', tableId: table.id, tableName: table.name })
      setMobileTab('cart')
    }
    setTablesPanelOpen(false)
  }

  const activeOrder = store.orders.find((o) => o.localId === store.activeOrderId) ?? null

  const filteredProducts = useMemo(() => {
    if (!search && !selectedCategory) return []
    const available = products.filter((p) => p.isAvailable)
    if (search) return available.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    return available.filter((p) => p.categoryId === selectedCategory)
  }, [products, selectedCategory, search])

  const activeCategories = useMemo(() => {
    const ids = new Set(products.filter((p) => p.isAvailable).map((p) => p.categoryId))
    return categories.filter((c) => ids.has(c.id))
  }, [products, categories])

  const selectedCat = selectedCategory
    ? categories.find((c) => c.id === selectedCategory) ?? null
    : null

  const totals = useMemo(() => {
    if (!activeOrder) return null
    const prodsForCalc = products.map((p) => ({
      id: p.id,
      taxRateId: p.taxRateId ?? null,
      taxRate: p.taxRate,
      taxName: p.taxName ?? null,
    }))
    return calcOrderTotals(activeOrder.items, prodsForCalc, {
      tipPercent: activeOrder.tipPercent,
      couponDiscount: activeOrder.couponDiscount,
      deliveryFee: activeOrder.origin.type === 'delivery' ? activeOrder.origin.deliveryFee : 0,
    })
  }, [activeOrder, products])

  function focusSearch() {
    setSearch('')
    // Small timeout so React flushes state before focusing
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function handleProductClick(product: ProductWithModifiers) {
    if (!activeOrder) {
      setShowNewOrderModal(true)
      return
    }
    if ((product.flavors?.length ?? 0) > 0) {
      setFlavorsProduct(product)
    } else if (product.modifierGroups.length > 0) {
      setModifiersProduct(product)
    } else {
      store.addItem(activeOrder.localId, {
        productId: product.id,
        productName: product.name,
        unitPrice: parseFloat(product.price),
        quantity: 1,
        modifiers: [],
        notes: '',
      })
      // On mobile web: switch to cart; on desktop the catalog stays visible
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setSearch('')
        setMobileTab('cart')
      } else {
        focusSearch()
      }
    }
  }

  function originLabel(origin: OrderOrigin) {
    if (origin.type === 'table') return origin.tableName ?? 'Mesa'
    if (origin.type === 'bar') return 'Barra'
    return `Domicilio — ${origin.customerName}`
  }

  function originIcon(origin: OrderOrigin) {
    if (origin.type === 'table') return <UtensilsCrossed className="h-3 w-3" />
    if (origin.type === 'delivery') return <Truck className="h-3 w-3" />
    return <BarChart3 className="h-3 w-3" />
  }

  async function handleSendToKitchen() {
    if (!activeOrder || !activeOrder.serverId) {
      await handleSaveOrder()
      return
    }
    setSaving(true)
    try {
      await fetch(`/api/tenant/orders/${activeOrder.serverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      })
      toast({ title: 'Pedido enviado a cocina', variant: 'success' })
    } catch {
      toast({ title: 'Error al enviar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveOrder() {
    if (!activeOrder || activeOrder.items.length === 0) return
    setSaving(true)

    try {
      const origin = activeOrder.origin
      const body = {
        type: origin.type,
        tableId: origin.type === 'table' ? origin.tableId : undefined,
        customerName: origin.type === 'delivery' ? origin.customerName : undefined,
        customerPhone: origin.type === 'delivery' ? origin.customerPhone : undefined,
        customerAddress: origin.type === 'delivery' ? origin.customerAddress : undefined,
        customerNotes: origin.type === 'delivery' ? origin.customerNotes : undefined,
        deliveryFee: origin.type === 'delivery' ? origin.deliveryFee : 0,
        notes: activeOrder.notes,
        localId: activeOrder.localId,
        items: activeOrder.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes,
          modifiers: i.modifiers,
        })),
      }

      const res = await fetch('/api/tenant/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      store.setServerId(activeOrder.localId, data.data.id)
      toast({ title: 'Pedido guardado', variant: 'success' })
    } catch (err) {
      toast({ title: 'Error al guardar pedido', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
    <div className="flex flex-1 overflow-hidden">

      {/* ── LEFT: Product catalog ────────────────────────────────────────── */}
      <div className={`flex-col overflow-hidden flex-1 ${mobileTab === 'catalog' ? 'flex' : 'hidden md:flex'}`}>
        {/* Order type selector */}
        <div className="border-b p-2 flex items-center gap-1.5">
          {barEnabled && (
            <button
              onClick={quickCreateBar}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${activeOrder?.origin.type === 'bar' ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary hover:bg-primary/5'}`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Barra
            </button>
          )}
          <button
            onClick={() => setTablesPanelOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${tablesPanelOpen || activeOrder?.origin.type === 'table' ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary hover:bg-primary/5'}`}
          >
            <UtensilsCrossed className="h-3.5 w-3.5" />
            Mesa
          </button>
          <button
            onClick={() => setShowNewOrderModal(true)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${activeOrder?.origin.type === 'delivery' ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary hover:bg-primary/5'}`}
          >
            <Truck className="h-3.5 w-3.5" />
            Domicilio
          </button>
          <div className="flex-1" />
          <OfflineIndicator />
        </div>

        {/* Tables picker (inline) */}
        {tablesPanelOpen && tables.length > 0 && (
          <div className="border-b p-3 bg-muted/30">
            <div className="flex flex-wrap gap-1.5">
              {tables.map((table) => {
                const isActive = activeOrder?.origin.type === 'table' && activeOrder.origin.tableId === table.id
                const isOccupied = table.status === 'occupied' && !isActive
                return (
                  <button
                    key={table.id}
                    onClick={() => !isOccupied && quickCreateOrSelectTable(table)}
                    disabled={isOccupied}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isOccupied
                        ? 'border-red-200 bg-red-50 text-red-400 cursor-not-allowed opacity-75 dark:bg-red-950 dark:border-red-800'
                        : 'bg-background hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    {table.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {/* Search */}
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Breadcrumb (categoría seleccionada, sin búsqueda) */}
        {selectedCat && !search && (
          <button
            onClick={() => setSelectedCategory(null)}
            className="flex items-center gap-2 px-4 py-2.5 border-b w-full text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {selectedCat.emoji} {selectedCat.name}
          </button>
        )}

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto">
          {!selectedCategory && !search ? (
            // Grid de categorías
            activeCategories.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 p-3">
                {activeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                  >
                    <span className="text-3xl">{cat.emoji ?? '📦'}</span>
                    <span className="text-xs font-semibold text-center leading-tight line-clamp-2">{cat.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mb-2" />
                <p className="text-sm">Sin categorías</p>
              </div>
            )
          ) : (
            // Lista de productos
            filteredProducts.length > 0 ? (
              <div>
                {filteredProducts.map((product) => {
                  const outOfStock = !product.inStock
                  const hasOptions = (product.flavors?.length ?? 0) > 0 || product.modifierGroups.length > 0
                  return (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product)}
                      disabled={outOfStock}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b text-left hover:bg-muted/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-tight truncate">{product.name}</p>
                        {outOfStock ? (
                          <p className="text-xs font-semibold text-destructive mt-0.5">Agotado</p>
                        ) : hasOptions ? (
                          <p className="text-xs text-muted-foreground mt-0.5">Personalizable</p>
                        ) : null}
                      </div>
                      {!outOfStock && (
                        <span className="text-sm font-semibold text-primary shrink-0">
                          {formatCurrency(product.price, currencySign)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mb-2" />
                <p className="text-sm">{search ? 'Sin resultados' : 'Sin productos en esta categoría'}</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── RIGHT: Cart ───────────────────────────────────────────────────── */}
      <div className={`border-l bg-background flex-col shrink-0 w-full md:w-80 ${mobileTab === 'cart' ? 'flex' : 'hidden md:flex'}`}>
        {activeOrder ? (
          <>
            {/* Order header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold">{originLabel(activeOrder.origin)}</p>
                <p className="text-xs text-muted-foreground">
                  {activeOrder.items.length} producto(s)
                </p>
              </div>
              <Badge variant={activeOrder.serverId ? 'success' : 'outline'} className="text-xs">
                {activeOrder.serverId ? 'Guardado' : 'Sin guardar'}
              </Badge>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto divide-y">
              {activeOrder.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                  <ShoppingCart className="h-8 w-8 mb-2" />
                  <p className="text-sm text-center">Selecciona productos del catálogo</p>
                </div>
              ) : (
                activeOrder.items.map((item) => (
                  <div key={item.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{item.productName}</p>
                      <button
                        onClick={() => store.removeItem(activeOrder.localId, item.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {item.modifiers.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {item.modifiers.map((m) => m.modifierName).join(', ')}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      {/* Qty control */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => store.updateItemQty(activeOrder.localId, item.id, item.quantity - 1)}
                          className="h-6 w-6 flex items-center justify-center rounded border hover:bg-muted"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => store.updateItemQty(activeOrder.localId, item.id, item.quantity + 1)}
                          className="h-6 w-6 flex items-center justify-center rounded border hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-sm font-medium">
                        {formatCurrency(
                          (item.unitPrice + item.modifiers.reduce((s, m) => s + m.priceDelta, 0)) * item.quantity,
                          currencySign
                        )}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals */}
            {totals && activeOrder.items.length > 0 && (
              <div className="border-t p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal, currencySign)}</span>
                </div>
                {totals.taxLines.map((t) => (
                  <div key={t.taxRateId} className="flex justify-between text-muted-foreground">
                    <span>{t.name} ({t.rate}%)</span>
                    <span>{formatCurrency(t.amount, currencySign)}</span>
                  </div>
                ))}
                {totals.tip > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Propina</span>
                    <span>{formatCurrency(totals.tip, currencySign)}</span>
                  </div>
                )}
                {totals.deliveryFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Domicilio</span>
                    <span>{formatCurrency(totals.deliveryFee, currencySign)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(totals.total, currencySign)}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-4 border-t space-y-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={handleSendToKitchen}
                disabled={saving || activeOrder.items.length === 0}
                loading={saving}
              >
                Enviar a cocina
              </Button>
              <Button
                className="w-full"
                onClick={() => setShowCloseModal(true)}
                disabled={activeOrder.items.length === 0}
              >
                Cobrar y cerrar
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 gap-3">
            <ShoppingCart className="h-12 w-12" />
            <p className="text-sm text-center">Selecciona Mesa, Barra o Domicilio para comenzar un pedido</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewOrderModal && (
        <NewOrderModal
          tables={tables}
          onClose={() => setShowNewOrderModal(false)}
          deliveryFields={deliveryFields}
          defaultDeliveryFee={defaultDeliveryFee}
          defaultTab="delivery"
          onCreate={(origin) => {
            store.newOrder(origin)
            setShowNewOrderModal(false)
            setMobileTab('cart')
          }}
        />
      )}

      {modifiersProduct && activeOrder && (
        <ModifiersModal
          product={modifiersProduct}
          currencySign={currencySign}
          onClose={() => setModifiersProduct(null)}
          onAdd={(item) => {
            store.addItem(activeOrder.localId, item)
            setModifiersProduct(null)
            focusSearch()
          }}
        />
      )}

      {flavorsProduct && activeOrder && (
        <FlavorsModal
          product={flavorsProduct}
          currencySign={currencySign}
          onClose={() => setFlavorsProduct(null)}
          onAdd={(flavor, qty) => {
            store.addItem(activeOrder.localId, {
              productId: flavorsProduct.id,
              productName: flavorsProduct.name,
              unitPrice: parseFloat(flavorsProduct.price),
              quantity: qty,
              modifiers: [],
              notes: `Sabor: ${flavor}`,
            })
            setFlavorsProduct(null)
            focusSearch()
          }}
        />
      )}

      {showCloseModal && activeOrder && totals && (
        <CloseOrderModal
          order={activeOrder}
          totals={totals}
          currencySign={currencySign}
          paymentMethods={paymentMethods}
          onClose={() => setShowCloseModal(false)}
          onConfirm={async (paymentData) => {
            setSaving(true)
            try {
              let orderId = activeOrder.serverId

              // Save order first if not yet saved
              if (!orderId) {
                const origin = activeOrder.origin
                const res = await fetch('/api/tenant/orders', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: origin.type,
                    tableId: origin.type === 'table' ? origin.tableId : undefined,
                    customerName: origin.type === 'delivery' ? origin.customerName : undefined,
                    customerPhone: origin.type === 'delivery' ? origin.customerPhone : undefined,
                    customerAddress: origin.type === 'delivery' ? origin.customerAddress : undefined,
                    deliveryFee: origin.type === 'delivery' ? origin.deliveryFee : 0,
                    notes: activeOrder.notes,
                    localId: activeOrder.localId,
                    items: activeOrder.items.map((i) => ({
                      productId: i.productId,
                      quantity: i.quantity,
                      notes: i.notes,
                      modifiers: i.modifiers,
                    })),
                  }),
                })
                const saved = await res.json()
                if (!res.ok) throw new Error(saved.error)
                orderId = saved.data.id
              }

              // Close the order
              const res = await fetch(`/api/tenant/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'close', ...paymentData }),
              })
              if (!res.ok) throw new Error()

              store.closeOrder(activeOrder.localId)
              setShowCloseModal(false)
              toast({ title: 'Pedido cerrado exitosamente', variant: 'success' })
            } catch {
              toast({ title: 'Error al cerrar pedido', variant: 'destructive' })
            } finally {
              setSaving(false)
            }
          }}
        />
      )}
    </div>

    {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
    <nav className="md:hidden flex border-t bg-background shrink-0">
      {([
        { id: 'catalog', label: 'Catálogo', icon: Search, badge: 0 },
        { id: 'cart', label: 'Carrito', icon: ShoppingCart, badge: activeOrder?.items.length ?? 0 },
      ] as const).map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          onClick={() => setMobileTab(id)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
            mobileTab === id ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <div className="relative">
            <Icon className="h-5 w-5" />
            {badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                {badge}
              </span>
            )}
          </div>
          {label}
        </button>
      ))}
    </nav>
    </div>
  )
}
