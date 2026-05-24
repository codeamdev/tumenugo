'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UtensilsCrossed, BarChart3, Truck } from 'lucide-react'
import type { OrderOrigin } from './pos-store'

interface DeliveryFields {
  phone: boolean
  address: boolean
  notes: boolean
  fee: boolean
}

interface Props {
  tables: { id: string; name: string; zone: string; status: string }[]
  onClose: () => void
  onCreate: (origin: OrderOrigin) => void
  deliveryFields?: DeliveryFields
  defaultDeliveryFee?: number
  defaultTab?: 'table' | 'bar' | 'delivery'
}

export function NewOrderModal({ tables, onClose, onCreate, deliveryFields, defaultDeliveryFee = 0, defaultTab = 'table' }: Props) {
  const df = deliveryFields ?? { phone: true, address: true, notes: true, fee: true }
  const [tab, setTab] = useState<'table' | 'bar' | 'delivery'>(defaultTab)
  const [selectedTable, setSelectedTable] = useState<{ id: string; name: string } | null>(null)
  const [delivery, setDelivery] = useState({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerNotes: '',
    deliveryFee: defaultDeliveryFee,
  })

  function handleCreate() {
    if (tab === 'table') {
      if (!selectedTable) return
      onCreate({ type: 'table', tableId: selectedTable.id, tableName: selectedTable.name })
    } else if (tab === 'bar') {
      onCreate({ type: 'bar' })
    } else {
      onCreate({ type: 'delivery', ...delivery })
    }
  }

  const isValid =
    tab === 'table' ? !!selectedTable :
    tab === 'bar' ? true :
    !!delivery.customerName

  const zones = Array.from(new Set(tables.map((t) => t.zone)))

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo pedido</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="table" className="flex-1">
              <UtensilsCrossed className="h-4 w-4 mr-1.5" />
              Mesa
            </TabsTrigger>
            <TabsTrigger value="bar" className="flex-1">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Barra
            </TabsTrigger>
            <TabsTrigger value="delivery" className="flex-1">
              <Truck className="h-4 w-4 mr-1.5" />
              Domicilio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="mt-4 space-y-3">
            {zones.map((zone) => (
              <div key={zone}>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{zone}</p>
                <div className="grid grid-cols-4 gap-2">
                  {tables.filter((t) => t.zone === zone).map((table) => (
                    <button
                      key={table.id}
                      onClick={() => setSelectedTable({ id: table.id, name: table.name })}
                      className={`rounded-lg border p-2 text-sm font-medium transition-colors ${
                        selectedTable?.id === table.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : table.status === 'occupied'
                          ? 'border-red-200 bg-red-50 text-red-600'
                          : 'hover:border-primary'
                      }`}
                    >
                      {table.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {tables.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay mesas configuradas
              </p>
            )}
          </TabsContent>

          <TabsContent value="bar" className="mt-4">
            <div className="rounded-lg border border-dashed p-8 text-center">
              <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Pedido para consumir en barra</p>
            </div>
          </TabsContent>

          <TabsContent value="delivery" className="mt-4 space-y-3">
            <div className={`gap-3 ${df.phone ? 'grid grid-cols-2' : ''}`}>
              <div className="space-y-1.5">
                <Label>Nombre del cliente *</Label>
                <Input
                  value={delivery.customerName}
                  onChange={(e) => setDelivery((d) => ({ ...d, customerName: e.target.value }))}
                  placeholder="Carlos López"
                />
              </div>
              {df.phone && (
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <Input
                    value={delivery.customerPhone}
                    onChange={(e) => setDelivery((d) => ({ ...d, customerPhone: e.target.value }))}
                    placeholder="311 234 5678"
                  />
                </div>
              )}
            </div>
            {df.address && (
              <div className="space-y-1.5">
                <Label>Dirección</Label>
                <Input
                  value={delivery.customerAddress}
                  onChange={(e) => setDelivery((d) => ({ ...d, customerAddress: e.target.value }))}
                  placeholder="Calle 50 #32-45, Apto 301"
                />
              </div>
            )}
            {(df.notes || df.fee) && (
              <div className={`gap-3 ${df.notes && df.fee ? 'grid grid-cols-2' : ''}`}>
                {df.notes && (
                  <div className="space-y-1.5">
                    <Label>Observaciones</Label>
                    <Input
                      value={delivery.customerNotes}
                      onChange={(e) => setDelivery((d) => ({ ...d, customerNotes: e.target.value }))}
                      placeholder="Tocar timbre"
                    />
                  </div>
                )}
                {df.fee && (
                  <div className="space-y-1.5">
                    <Label>Valor domicilio ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={delivery.deliveryFee}
                      onChange={(e) => setDelivery((d) => ({ ...d, deliveryFee: Number(e.target.value) }))}
                    />
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleCreate} disabled={!isValid} className="flex-1">
            Crear pedido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
