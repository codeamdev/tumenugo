#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# deploy.sh — Despliegue de producción: Cafeteria SaaS
#
# Uso:
#   cd /opt/cafeteria
#   bash scripts/deploy.sh
#
# Requiere: Node.js 20 LTS, PM2, ecosystem.config.js configurado
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="/opt/cafeteria"
LOG_FILE="/var/log/cafeteria/deploy.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo_step() { echo -e "\n\033[1;34m▶ $*\033[0m"; }
echo_ok()   { echo -e "\033[1;32m✓ $*\033[0m"; }
echo_warn() { echo -e "\033[1;33m⚠ $*\033[0m"; }

# Redirigir también a log file
exec > >(tee -a "$LOG_FILE") 2>&1
echo "═══════════════════════════════════════"
echo "Deploy iniciado: $TIMESTAMP"
echo "═══════════════════════════════════════"

cd "$APP_DIR"

# ── 1. Pull código ─────────────────────────────────────────────────────────
echo_step "Actualizando código fuente..."
git pull origin main
echo_ok "Código actualizado"

# ── 2. Instalar dependencias ───────────────────────────────────────────────
echo_step "Instalando dependencias..."
npm ci --include=dev
echo_ok "Dependencias instaladas"

# ── 3. Build de producción ─────────────────────────────────────────────────
# IMPORTANTE: Las vars NEXT_PUBLIC_* se hornean en el bundle durante el build.
# ecosystem.config.js define las vars correctas.
echo_step "Generando build de producción..."
NODE_ENV=production \
  NEXT_PUBLIC_BASE_DOMAIN="$(node -e "const e=require('./ecosystem.config.js'); console.log(e.apps[0].env_production.NEXT_PUBLIC_BASE_DOMAIN)")" \
  NEXT_PUBLIC_APP_URL="$(node -e "const e=require('./ecosystem.config.js'); console.log(e.apps[0].env_production.NEXT_PUBLIC_APP_URL)")" \
  DATABASE_URL="$(node -e "const e=require('./ecosystem.config.js'); console.log(e.apps[0].env_production.DATABASE_URL)")" \
  npm run build
echo_ok "Build completado"

# ── 4. Copiar assets estáticos al standalone ───────────────────────────────
# Requerido por output: 'standalone' — Next.js NO los copia automáticamente
echo_step "Copiando assets al standalone..."
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
echo_ok "Assets copiados"

# ── 5. Migraciones de base de datos ───────────────────────────────────────
echo_step "Aplicando migraciones de base de datos..."
DATABASE_URL="$(node -e "const e=require('./ecosystem.config.js'); console.log(e.apps[0].env_production.DATABASE_URL)")" \
  npm run db:migrate:public
DATABASE_URL="$(node -e "const e=require('./ecosystem.config.js'); console.log(e.apps[0].env_production.DATABASE_URL)")" \
  npm run db:migrate:tenants
echo_ok "Migraciones aplicadas"

# ── 6. Reiniciar aplicación ────────────────────────────────────────────────
echo_step "Reiniciando PM2..."
if pm2 list | grep -q "cafeteria"; then
  pm2 reload ecosystem.config.js --env production --update-env
else
  pm2 start ecosystem.config.js --env production
fi
pm2 save
echo_ok "PM2 reiniciado"

# ── 7. Verificar que está corriendo ───────────────────────────────────────
echo_step "Verificando salud de la aplicación..."
sleep 3
STATUS=$(pm2 jlist 2>/dev/null | node -e "
  const apps = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const app = apps.find(a => a.name === 'cafeteria');
  console.log(app ? app.pm2_env.status : 'not_found');
")
if [ "$STATUS" = "online" ]; then
  echo_ok "Aplicación en línea (PM2 status: online)"
else
  echo_warn "Estado inesperado: $STATUS — revisa: pm2 logs cafeteria"
fi

# Health check HTTP
sleep 2
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/api/auth/me || true)
if [[ "$HTTP_STATUS" =~ ^(200|401|403|405)$ ]]; then
  echo_ok "Health check HTTP OK (status: $HTTP_STATUS)"
else
  echo_warn "Health check devolvió: $HTTP_STATUS — puede estar iniciando..."
fi

echo ""
echo "═══════════════════════════════════════"
echo_ok "Deploy finalizado: $(date)"
echo "  pm2 logs cafeteria    → ver logs"
echo "  pm2 monit             → monitoreo"
echo "═══════════════════════════════════════"
