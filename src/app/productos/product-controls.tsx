'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'

export function ProductToggleAvailable({ productId, isAvailable }: { productId: string; isAvailable: boolean }) {
  const [available, setAvailable] = useState(isAvailable)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function toggle() {
    setLoading(true)
    const next = !available
    try {
      const res = await fetch(`/api/tenant/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: next }),
      })
      if (!res.ok) throw new Error()
      setAvailable(next)
      router.refresh()
      toast({ title: next ? 'Producto visible en POS' : 'Producto oculto del POS', variant: next ? 'success' : 'default' })
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all disabled:opacity-50 ${
        available
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {available ? 'Visible' : 'Oculto'}
    </button>
  )
}

export function ProductToggleInStock({ productId, inStock }: { productId: string; inStock: boolean }) {
  const [stock, setStock] = useState(inStock)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function toggle() {
    setLoading(true)
    const next = !stock
    try {
      const res = await fetch(`/api/tenant/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inStock: next }),
      })
      if (!res.ok) throw new Error()
      setStock(next)
      router.refresh()
      toast({ title: next ? 'Producto en stock' : 'Marcado como agotado', variant: next ? 'success' : 'default' })
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all disabled:opacity-50 ${
        stock
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
          : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 dark:bg-red-950 dark:border-red-800 dark:text-red-400'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${stock ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {stock ? 'En stock' : 'Agotado'}
    </button>
  )
}
