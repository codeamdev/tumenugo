'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/utils'
import { Plus, Minus } from 'lucide-react'
import type { CartItem } from '@/lib/order-calc'

interface ModifierOption {
  id: string
  name: string
  priceDelta: string
  isDefault: boolean
  sortOrder: number
}

interface ModifierGroupData {
  id: string
  name: string
  selectionType: string
  isRequired: boolean
  minSelections: number
  maxSelections?: number | null
  modifiers: ModifierOption[]
}

interface ProductData {
  id: string
  name: string
  price: string
  modifierGroups: ModifierGroupData[]
}

interface Props {
  product: ProductData
  currencySign: string
  onClose: () => void
  onAdd: (item: Omit<CartItem, 'id'>) => void
}

export function ModifiersModal({ product, currencySign, onClose, onAdd }: Props) {
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {}
    for (const group of product.modifierGroups) {
      const defaultMods = group.modifiers
        .filter((m) => m.isDefault)
        .map((m) => m.id)
      if (defaultMods.length > 0) defaults[group.id] = defaultMods
    }
    return defaults
  })

  function toggleModifier(groupId: string, modId: string, selectionType: string) {
    setSelected((prev) => {
      const current = prev[groupId] ?? []
      if (selectionType === 'single') {
        return { ...prev, [groupId]: [modId] }
      }
      if (current.includes(modId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== modId) }
      }
      return { ...prev, [groupId]: [...current, modId] }
    })
  }

  function calcTotalPrice(): number {
    let total = parseFloat(product.price)
    for (const group of product.modifierGroups) {
      const selIds = selected[group.id] ?? []
      for (const mod of group.modifiers) {
        if (selIds.includes(mod.id)) {
          total += parseFloat(mod.priceDelta)
        }
      }
    }
    return total * quantity
  }

  function isValid(): boolean {
    for (const group of product.modifierGroups) {
      if (group.isRequired) {
        const sel = selected[group.id] ?? []
        if (sel.length < (group.minSelections || 1)) return false
      }
    }
    return true
  }

  function handleAdd() {
    const modifiers = []
    for (const group of product.modifierGroups) {
      const selIds = selected[group.id] ?? []
      for (const mod of group.modifiers) {
        if (selIds.includes(mod.id)) {
          modifiers.push({
            groupName: group.name,
            modifierName: mod.name,
            priceDelta: parseFloat(mod.priceDelta),
          })
        }
      }
    }

    onAdd({
      productId: product.id,
      productName: product.name,
      unitPrice: parseFloat(product.price),
      quantity,
      modifiers,
      notes,
    })
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        {/* Quantity */}
        <div className="flex items-center justify-between py-2">
          <Label>Cantidad</Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-lg font-semibold w-8 text-center">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Modifier groups */}
        {product.modifierGroups.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{group.name}</p>
              {group.isRequired && (
                <Badge variant="destructive" className="text-xs">Requerido</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {group.selectionType === 'single' ? 'Elige uno' : 'Elige varios'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {group.modifiers.map((mod) => {
                const isSelected = (selected[group.id] ?? []).includes(mod.id)
                return (
                  <button
                    key={mod.id}
                    onClick={() => toggleModifier(group.id, mod.id, group.selectionType)}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'hover:border-muted-foreground'
                    }`}
                  >
                    <span className="font-medium">{mod.name}</span>
                    {parseFloat(mod.priceDelta) !== 0 && (
                      <span className="text-xs text-muted-foreground">
                        {parseFloat(mod.priceDelta) > 0 ? '+' : ''}
                        {formatCurrency(mod.priceDelta)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Notes */}
        <div className="space-y-2">
          <Label>Notas (opcional)</Label>
          <Textarea
            placeholder="Sin cebolla, extra salsa..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={!isValid()}>
            Agregar — {formatCurrency(calcTotalPrice())}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
