'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, Minus } from 'lucide-react'

interface Props {
  product: { id: string; name: string; price: string; flavors: string[] }
  currencySign: string
  onClose: () => void
  onAdd: (flavor: string, qty: number) => void
}

export function FlavorsModal({ product, currencySign, onClose, onAdd }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const unitPrice = parseFloat(product.price)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">{product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-3">
            <p className="text-sm font-semibold">Elige el sabor</p>
            <div className="flex flex-wrap gap-2">
              {product.flavors.map((fl) => (
                <button
                  key={fl}
                  type="button"
                  onClick={() => setSelected(fl)}
                  className={`rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-colors ${
                    selected === fl
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-muted/40 hover:border-primary'
                  }`}
                >
                  {fl}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Cantidad</p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-9 w-9 flex items-center justify-center rounded-full border-2 hover:border-primary transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="text-2xl font-bold w-8 text-center">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="h-9 w-9 flex items-center justify-center rounded-full border-2 hover:border-primary transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!selected}
            onClick={() => { if (selected) { onAdd(selected, qty); onClose() } }}
          >
            Agregar · {formatCurrency(unitPrice * qty, currencySign)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
