'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'

interface Props {
  productId: string
  isAvailable: boolean
}

export function ProductToggleAvailable({ productId, isAvailable }: Props) {
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
      toast({ title: next ? 'Producto disponible' : 'Producto agotado', variant: next ? 'success' : 'default' })
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
      {available ? 'Disponible' : 'Agotado'}
    </button>
  )
}
