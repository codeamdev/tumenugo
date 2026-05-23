/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, NetworkFirst, CacheFirst } from 'serwist'
import { defaultCache } from '@serwist/next/worker'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // API routes: network first, fall back to cache for 1 hour offline
    {
      matcher: /^https?:\/\/.*\/api\/tenant\//,
      handler: new NetworkFirst({
        cacheName: 'api-cache',
        plugins: [],
        networkTimeoutSeconds: 5,
      }),
    },
    // Static assets: cache first
    {
      matcher: /\/_next\/static\//,
      handler: new CacheFirst({
        cacheName: 'next-static',
        plugins: [],
      }),
    },
    // Images
    {
      matcher: /\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
      handler: new CacheFirst({
        cacheName: 'image-cache',
        plugins: [],
      }),
    },
    // Default page/navigation strategy
    ...defaultCache,
  ],
})

serwist.addEventListeners()
