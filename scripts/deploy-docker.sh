#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# deploy-docker.sh — Despliegue Docker de producción: Cafeteria SaaS
#
# Uso (desde /opt/cafeteria):
#   bash scripts/deploy-docker.sh
#
# Requiere: Docker Engine 24+, Docker Compose v2, archivo .env.production listo
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="/opt/cafeteria"
LOG_DIR="/var/log/cafeteria"
LOG_FILE="$LOG_DIR/deploy.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ENV_FILE=".env.production"

echo_step() { echo -e "\n\033[1;34m▶ $*\033[0m"; }
echo_ok()   { echo -e "\033[1;32m✓ $*\033[0m"; }
echo_warn() { echo -e "\033[1;33m⚠ $*\033[0m"; }
echo_err()  { echo -e "\033[1;31m✗ $*\033[0m"; }

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "═══════════════════════════════════════"
echo "Deploy Docker iniciado: $TIMESTAMP"
echo "═══════════════════════════════════════"

cd "$APP_DIR"

# ── Verificar requisitos ───────────────────────────────────────────────────────
echo_step "Verificando requisitos..."
if [ ! -f "$ENV_FILE" ]; then
  echo_err ".env.production no encontrado. Crea el archivo antes de desplegar."
  exit 1
fi
command -v docker >/dev/null 2>&1 || { echo_err "Docker no está instalado."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo_err "Docker Compose v2 no está instalado."; exit 1; }
echo_ok "Requisitos OK"

# ── Pull código ────────────────────────────────────────────────────────────────
echo_step "Actualizando código fuente..."
git pull origin main
echo_ok "Código actualizado"

# ── Build imágenes ─────────────────────────────────────────────────────────────
echo_step "Construyendo imágenes Docker..."
docker compose --env-file "$ENV_FILE" build --no-cache app migrate
echo_ok "Imágenes construidas"

# ── Levantar base de datos ────────────────────────────────────────────────────
echo_step "Iniciando PostgreSQL..."
docker compose --env-file "$ENV_FILE" up -d postgres
echo_step "Esperando que PostgreSQL esté listo..."
timeout 60 bash -c 'until docker compose --env-file .env.production exec -T postgres pg_isready -U cafeteria_app -d cafeteria >/dev/null 2>&1; do sleep 2; done'
echo_ok "PostgreSQL listo"

# ── Migraciones ───────────────────────────────────────────────────────────────
echo_step "Aplicando migraciones de base de datos..."
docker compose --env-file "$ENV_FILE" run --rm migrate
echo_ok "Migraciones aplicadas"

# ── Desplegar aplicación ───────────────────────────────────────────────────────
echo_step "Reiniciando aplicación..."
docker compose --env-file "$ENV_FILE" up -d --force-recreate app nginx
echo_ok "Aplicación desplegada"

# ── Verificar salud ────────────────────────────────────────────────────────────
echo_step "Verificando salud de la aplicación..."
sleep 10

APP_HEALTH=$(docker compose --env-file "$ENV_FILE" ps --format json app 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health','unknown'))" 2>/dev/null || echo "unknown")

if [ "$APP_HEALTH" = "healthy" ]; then
  echo_ok "App health: healthy"
else
  echo_warn "App health: $APP_HEALTH — puede estar iniciando, verifica: docker compose logs app"
fi

# Health check HTTP
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1/api/auth/me || true)
if [[ "$HTTP_STATUS" =~ ^(200|401|403|405)$ ]]; then
  echo_ok "Health check HTTP OK (status: $HTTP_STATUS)"
else
  echo_warn "HTTP status: $HTTP_STATUS — puede estar iniciando aún..."
fi

# ── Limpiar imágenes antiguas ──────────────────────────────────────────────────
echo_step "Limpiando imágenes no utilizadas..."
docker image prune -f >/dev/null 2>&1 || true
echo_ok "Limpieza completada"

echo ""
echo "═══════════════════════════════════════"
echo_ok "Deploy finalizado: $(date)"
echo "  docker compose logs -f app    → ver logs"
echo "  docker compose ps             → estado servicios"
echo "  docker stats                  → uso de recursos"
echo "═══════════════════════════════════════"
