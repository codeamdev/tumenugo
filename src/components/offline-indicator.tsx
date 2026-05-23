'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { WifiOff, Wifi, RefreshCw } from 'lucide-react'
import { getPendingCount, syncPendingOrders } from '@/lib/offline/sync'

export function OfflineIndicator() {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)

    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function check() {
      const count = await getPendingCount()
      if (!cancelled) setPending(count)
    }
    check()
    const timer = setInterval(check, 15_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  // Auto-sync when coming back online
  useEffect(() => {
    if (online && pending > 0) {
      handleSync()
    }
  }, [online])

  async function handleSync() {
    setSyncing(true)
    try {
      await syncPendingOrders()
      const count = await getPendingCount()
      setPending(count)
    } finally {
      setSyncing(false)
    }
  }

  if (online && pending === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      {!online && (
        <Badge variant="destructive" className="gap-1 text-xs">
          <WifiOff className="h-3 w-3" />
          Sin conexión
        </Badge>
      )}
      {pending > 0 && (
        <button
          onClick={handleSync}
          disabled={syncing || !online}
          className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 px-2.5 py-1 text-xs font-medium hover:bg-amber-200 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
          {pending} pendiente{pending > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
