'use client'

import { getOfflineDB } from './db'

const MAX_RETRIES = 3

export async function syncPendingOrders(): Promise<{ synced: number; failed: number }> {
  const db = getOfflineDB()
  const pending = await db.pendingOrders
    .where('syncStatus')
    .anyOf(['pending', 'error'])
    .filter((o) => (o.retries ?? 0) < MAX_RETRIES)
    .toArray()

  let synced = 0
  let failed = 0

  for (const order of pending) {
    await db.pendingOrders.update(order.id!, { syncStatus: 'syncing' })
    try {
      const res = await fetch('/api/tenant/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order.payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      await db.pendingOrders.update(order.id!, {
        syncStatus: 'done',
        serverId: json.data?.id,
      })
      synced++
    } catch (err) {
      await db.pendingOrders.update(order.id!, {
        syncStatus: 'error',
        retries: (order.retries ?? 0) + 1,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      failed++
    }
  }

  return { synced, failed }
}

export async function getPendingCount(): Promise<number> {
  const db = getOfflineDB()
  return db.pendingOrders
    .where('syncStatus')
    .anyOf(['pending', 'error'])
    .count()
}
