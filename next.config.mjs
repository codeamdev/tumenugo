// @ts-check
import withSerwist from '@serwist/next'

/** @type {import('next').NextConfig} */
const baseConfig = {
  output: 'standalone',
  allowedDevOrigins: ['admin.localhost', '*.localhost', 'localhost:*', '192.168.1.*'],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-tenant-slug' },
        ],
      },
    ]
  },
  images: {
    // Wildcard hostname is a DoS vector (GHSA-9g9p-9gw9-jx7f).
    // Add specific trusted hostnames here when needed.
    remotePatterns: [],
  },
  experimental: {
    serverComponentsExternalPackages: ['@node-rs/argon2', 'pdf-parse', '@anthropic-ai/sdk'],
  },
}

export default withSerwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})(baseConfig)
