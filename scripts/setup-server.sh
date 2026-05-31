#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# setup-server.sh — TuMenuGo — Instalación inicial en servidor Linux
#
# Uso: bash scripts/setup-server.sh
#
# Requisitos: docker, docker compose v2, git, nginx, psql, openssl, curl
# Servidor: Linux con PostgreSQL local, nginx del sistema, IP 2.25.145.148
# IMPORTANTE: No modifica /srv/catalogo ni su configuración de nginx.
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' W='\033[1m' N='\033[0m'

step()    { echo -e "\n${W}${B}══ $* ══${N}"; }
info()    { echo -e "  ${B}▶${N} $*"; }
ok()      { echo -e "  ${G}✔${N} $*"; }
warn()    { echo -e "  ${Y}⚠${N} $*"; }
die()     { echo -e "  ${R}✖${N} $*"; exit 1; }
ask()     { echo -en "  ${W}?${N} $1: "; }
confirm() { ask "$1 (s/N)"; read -r _R; [[ "$_R" == "s" || "$_R" == "S" ]]; }

# ── Configuración ─────────────────────────────────────────────────────────────
APP_DIR="/srv/tumenugo/web"
REPO_URL="https://github.com/codeamdev/tumenugo.git"
SERVER_IP="2.25.145.148"
APP_PORT=3001
DB_NAME="cafeteria"
DB_USER="postgres"
NGINX_SITE="tumenugo"
COMPOSE_FILE="docker-compose.phase1.yml"
ENV_FILE=".env.production"

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 1/10 — Verificando prerequisitos"
# ══════════════════════════════════════════════════════════════════════════════

for cmd in docker git nginx psql openssl curl; do
  command -v "$cmd" &>/dev/null && ok "$cmd" || die "$cmd no encontrado. Instálalo antes de continuar."
done

docker compose version &>/dev/null && ok "docker compose v2" || die "Docker Compose v2 no encontrado."

# Seguridad: asegurarse de no pisar catalogo en ningún momento
[ -d "/srv/catalogo" ] && ok "/srv/catalogo detectado — no será tocado" \
  || warn "/srv/catalogo no encontrado (si está en otra ruta, está bien)"

# Puerto libre
ss -tlnp 2>/dev/null | grep -q ":${APP_PORT} " \
  && die "Puerto ${APP_PORT} en uso. Edita APP_PORT en este script." \
  || ok "Puerto ${APP_PORT} disponible"

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 2/10 — Creando estructura en /srv"
# ══════════════════════════════════════════════════════════════════════════════

# Guardia extra: APP_DIR nunca puede contener 'catalogo'
[[ "$APP_DIR" == *"catalogo"* ]] && die "APP_DIR contiene 'catalogo'. Abortando."

if [ ! -d "$APP_DIR" ]; then
  mkdir -p "$APP_DIR"
  ok "Creado $APP_DIR"
else
  warn "$APP_DIR ya existe — se omite mkdir"
fi

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 3/10 — Repositorio"
# ══════════════════════════════════════════════════════════════════════════════

if [ -d "$APP_DIR/.git" ]; then
  info "Repositorio existe — actualizando..."
  git -C "$APP_DIR" pull origin master
  ok "Repositorio actualizado"
else
  info "Clonando repositorio..."
  git clone "$REPO_URL" "$APP_DIR"
  ok "Repositorio clonado en $APP_DIR"
fi

cd "$APP_DIR"

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 4/10 — PostgreSQL"
# ══════════════════════════════════════════════════════════════════════════════

# En Linux, PostgreSQL acepta conexiones locales por Unix socket (peer auth),
# no por TCP por defecto. Usamos sudo -u postgres para las operaciones locales
# y configuramos TCP para que Docker pueda conectar.

# ── 4a. Verificar que PostgreSQL está corriendo ───────────────────────────────
sudo -u postgres psql -c '\q' 2>/dev/null \
  || die "No se puede conectar a PostgreSQL vía Unix socket. ¿Está corriendo? Verifica: sudo systemctl status postgresql"
ok "PostgreSQL accesible (Unix socket)"

# ── 4b. Detectar versión y rutas de configuración ────────────────────────────
PG_VERSION=$(sudo -u postgres psql -tAc "SHOW server_version_num;" 2>/dev/null | cut -c1-2 || echo "")
PG_CONF_DIR=$(sudo -u postgres psql -tAc "SHOW config_file;" 2>/dev/null | xargs dirname || echo "")
PG_CONF="$PG_CONF_DIR/postgresql.conf"
PG_HBA="$PG_CONF_DIR/pg_hba.conf"
info "Configuración en: $PG_CONF_DIR"

# ── 4c. Crear base de datos si no existe ─────────────────────────────────────
if sudo -u postgres psql -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  warn "Base de datos '$DB_NAME' ya existe — se omite la creación"
else
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" 2>/dev/null
  ok "Base de datos '$DB_NAME' creada"
fi

# ── 4d. Contraseña del usuario postgres (necesaria para Docker vía TCP) ───────
echo ""
info "El contenedor Docker se conecta a PostgreSQL por TCP."
info "Se necesita una contraseña para el usuario 'postgres'."
echo ""
ask "Contraseña para usuario 'postgres' (nueva o existente)"
read -rs DB_PASSWORD
echo ""
ask "Confirmar contraseña"
read -rs DB_PASSWORD2
echo ""

[ "$DB_PASSWORD" = "$DB_PASSWORD2" ] || die "Las contraseñas no coinciden."
[ -n "$DB_PASSWORD" ] || die "La contraseña no puede estar vacía."

sudo -u postgres psql -c "ALTER USER postgres PASSWORD '${DB_PASSWORD}';" 2>/dev/null
ok "Contraseña del usuario 'postgres' configurada"

# ── 4e. Habilitar TCP en postgresql.conf ──────────────────────────────────────
CURRENT_LISTEN=$(sudo grep -E "^listen_addresses" "$PG_CONF" 2>/dev/null | head -1 || echo "")
if echo "$CURRENT_LISTEN" | grep -qE "\*|0\.0\.0\.0"; then
  ok "PostgreSQL ya escucha en todas las interfaces"
else
  info "Configurando listen_addresses = '*' en postgresql.conf..."
  sudo sed -i "s/^#\?listen_addresses\s*=.*/listen_addresses = '*'/" "$PG_CONF"
  ok "listen_addresses actualizado"
  PG_RELOAD_NEEDED=true
fi

# ── 4f. Agregar regla Docker en pg_hba.conf ───────────────────────────────────
DOCKER_SUBNET="172.17.0.0/16"
HBA_RULE="host    all    postgres    ${DOCKER_SUBNET}    scram-sha-256"

if sudo grep -qF "$DOCKER_SUBNET" "$PG_HBA" 2>/dev/null; then
  ok "pg_hba.conf ya tiene regla para subnet Docker"
else
  info "Agregando regla Docker en pg_hba.conf..."
  echo "$HBA_RULE" | sudo tee -a "$PG_HBA" > /dev/null
  ok "Regla agregada: $HBA_RULE"
  PG_RELOAD_NEEDED=true
fi

# ── 4g. Recargar PostgreSQL si hubo cambios ───────────────────────────────────
if [ "${PG_RELOAD_NEEDED:-false}" = true ]; then
  info "Recargando PostgreSQL..."
  sudo systemctl reload postgresql 2>/dev/null || sudo pg_ctlcluster "$PG_VERSION" main reload 2>/dev/null || \
    warn "No se pudo recargar automáticamente. Ejecuta: sudo systemctl reload postgresql"
  ok "PostgreSQL recargado"
fi

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 5/10 — Variables de entorno (.env.production)"
# ══════════════════════════════════════════════════════════════════════════════

SKIP_ENV=false
if [ -f "$ENV_FILE" ]; then
  warn ".env.production ya existe"
  confirm "¿Sobreescribir?" || SKIP_ENV=true
fi

if [ "$SKIP_ENV" = false ]; then
  echo ""
  ask "Tenant por defecto (slug, Enter para ninguno)"
  read -r DEFAULT_TENANT_SLUG

  JWT_SECRET=$(openssl rand -hex 64)
  JWT_REFRESH_SECRET=$(openssl rand -hex 64)

  cat > "$ENV_FILE" <<EOF
# Generado por setup-server.sh — $(date)
# ⚠ No subir a git — contiene secretos

# ── Dominio / IP (Fase 1) ─────────────────────────────────────────────────────
NEXT_PUBLIC_BASE_DOMAIN=${SERVER_IP}
NEXT_PUBLIC_APP_URL=http://${SERVER_IP}

# ── Tenant por defecto (vacío = desactivado) ──────────────────────────────────
DEFAULT_TENANT_SLUG=${DEFAULT_TENANT_SLUG}

# ── Base de datos (postgres del sistema host vía Docker) ─────────────────────
# host.docker.internal se resuelve al host gracias a extra_hosts en compose
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@host.docker.internal:5432/${DB_NAME}
DB_POOL_MAX=20

# ── JWT (generados automáticamente) ──────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

# ── Opcionales ────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=
DEBUG=false
EOF

  chmod 600 "$ENV_FILE"
  ok ".env.production creado (permisos 600)"
fi

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 6/10 — Build Docker"
# ══════════════════════════════════════════════════════════════════════════════

info "Construyendo imagen (3-5 minutos)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
ok "Imagen construida"

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 7/10 — Migraciones"
# ══════════════════════════════════════════════════════════════════════════════

info "Aplicando migraciones de base de datos..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  --profile migrate run --rm migrate
ok "Migraciones aplicadas"

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 8/10 — Levantando contenedor"
# ══════════════════════════════════════════════════════════════════════════════

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans
info "Esperando healthcheck (máx. 90 segundos)..."

for i in $(seq 1 18); do
  STATUS=$(docker compose -f "$COMPOSE_FILE" ps --format '{{.Health}}' app 2>/dev/null || echo "")
  if [ "$STATUS" = "healthy" ]; then
    ok "Contenedor saludable en puerto ${APP_PORT}"
    break
  fi
  echo -n "."
  sleep 5
  [ "$i" -eq 18 ] && warn "Healthcheck pendiente — revisa: docker compose -f $COMPOSE_FILE logs app"
done
echo ""

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 9/10 — Nginx"
# ══════════════════════════════════════════════════════════════════════════════

NGINX_AVAILABLE="/etc/nginx/sites-available/${NGINX_SITE}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_SITE}"

# Verificar conflictos con configs existentes (nunca tocar catalogo)
CONFLICT=$(grep -rl "server_name.*${SERVER_IP}\|server_name _;" /etc/nginx/sites-enabled/ 2>/dev/null \
  | grep -v "$NGINX_SITE" || true)

if [ -n "$CONFLICT" ]; then
  warn "Posible conflicto nginx — estas configs ya usan server_name con la IP o son catch-all:"
  echo "$CONFLICT" | while read -r f; do echo "    $f"; done
  echo ""
  warn "Verifica que no sea la config de 'catalogo' antes de continuar."
  confirm "¿Continuar con la instalación de nginx?" || {
    warn "Nginx omitido. Instala manualmente copiando nginx/nginx-phase1.conf"
    warn "en /etc/nginx/sites-available/${NGINX_SITE} y actívalo con symlink."
    # Saltamos al paso 10 sin salir
    SKIP_NGINX=true
  }
fi

if [ "${SKIP_NGINX:-false}" = false ]; then
  sudo cp "nginx/nginx-phase1.conf" "$NGINX_AVAILABLE"
  ok "Config copiada a $NGINX_AVAILABLE"

  if [ ! -L "$NGINX_ENABLED" ]; then
    sudo ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
    ok "Sitio activado en sites-enabled"
  else
    warn "Symlink ya existe — se mantiene"
  fi

  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    ok "Nginx recargado"
  else
    die "nginx -t falló. Revisa la config antes de continuar:\n  sudo nginx -t"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
step "Paso 10/10 — Provisioning inicial"
# ══════════════════════════════════════════════════════════════════════════════

RUN_SCRIPT="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE --profile migrate run --rm migrate"

if confirm "¿Crear superadmin ahora?"; then
  $RUN_SCRIPT npm run superadmin:create
  ok "Superadmin creado"
fi

if confirm "¿Crear primer tenant ahora?"; then
  $RUN_SCRIPT npm run tenant:provision
  ok "Tenant creado"
  info "Recuerda configurar el tenant por defecto en:"
  info "  http://${SERVER_IP}/superadmin → Configuración"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${W}${G}══════════════════════════════════════════════${N}"
echo -e "${W}${G}  Instalación completada${N}"
echo -e "${W}${G}══════════════════════════════════════════════${N}"
echo ""
echo -e "  ${W}Web POS:${N}     http://${SERVER_IP}"
echo -e "  ${W}Superadmin:${N}  http://${SERVER_IP}/superadmin"
echo -e "  ${W}App móvil:${N}   EXPO_PUBLIC_TENANT_URL=http://${SERVER_IP}"
echo ""
echo -e "  ${W}Logs:${N}    docker compose -f ${APP_DIR}/${COMPOSE_FILE} logs -f app"
echo -e "  ${W}Restart:${N} docker compose -f ${APP_DIR}/${COMPOSE_FILE} --env-file ${APP_DIR}/${ENV_FILE} restart"
echo -e "  ${W}Update:${N}  git -C ${APP_DIR} pull && bash ${APP_DIR}/scripts/deploy-docker.sh"
echo ""
