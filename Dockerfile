# ══════════════════════════════════════════════════════════════════════════════
# Dockerfile — Cafeteria SaaS
# Multi-stage: deps → migrator | builder → runner
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

# ── Stage 2: Dependencies ─────────────────────────────────────────────────────
FROM base AS deps
# libc6-compat: required for @node-rs/argon2 musl binaries on Alpine
# python3/make/g++: fallback compiler if pre-built native binaries don't match
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 3: Builder ──────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# NEXT_PUBLIC_* vars are baked into the client bundle at build time.
# Must be passed as build args — runtime env vars won't work for client code.
ARG NEXT_PUBLIC_BASE_DOMAIN
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BASE_DOMAIN=$NEXT_PUBLIC_BASE_DOMAIN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Stage 4: Migrator ─────────────────────────────────────────────────────────
# Separate stage with full node_modules + TypeScript source to run tsx migrations.
# Used by the 'migrate' service in docker-compose, NOT the production runner.
FROM deps AS migrator
WORKDIR /app
COPY . .
# Usage: docker compose --env-file .env.production run --rm migrate

# ── Stage 5: Runner (production image) ────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone server (bundles only required node_modules for runtime)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/auth/me', \
    (r) => r.statusCode < 500 ? process.exit(0) : process.exit(1) \
  ).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
