import Dexie, { type Table } from 'dexie'

export interface OfflineOrder {
  id?: number
  localId: string
  payload: object
  createdAt: number
  syncStatus: 'pending' | 'syncing' | 'done' | 'error'
  serverId?: string
  errorMessage?: string
  retries: number
}

export interface OfflineCatalogProduct {
  id: string
  name: string
  price: number
  categoryId: string
  categoryName: string
  isAvailable: boolean
  modifierGroups: object[]
  cachedAt: number
}

export class CafeteriaOfflineDB extends Dexie {
  pendingOrders!: Table<OfflineOrder>
  catalogProducts!: Table<OfflineCatalogProduct>

  constructor() {
    super('cafeteria-offline')
    this.version(1).stores({
      pendingOrders: '++id, localId, syncStatus, createdAt',
      catalogProducts: 'id, categoryId, cachedAt',
    })
  }
}

let _db: CafeteriaOfflineDB | null = null

export function getOfflineDB(): CafeteriaOfflineDB {
  if (typeof window === 'undefined') throw new Error('getOfflineDB only on client')
  if (!_db) _db = new CafeteriaOfflineDB()
  return _db
}
