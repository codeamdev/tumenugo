#!/usr/bin/env bash
# Wildcard SSL certificate setup using Let's Encrypt + Certbot (DNS-01 challenge).
# Tested on Ubuntu 22.04 LTS. Requires: certbot, your DNS provider plugin.
#
# Common DNS plugins: certbot-dns-cloudflare, certbot-dns-route53, certbot-dns-digitalocean
# Install example (Cloudflare): pip install certbot-dns-cloudflare
#
# Usage: DOMAIN=yourdomain.com EMAIL=you@yourdomain.com ./ssl-setup.sh

set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN=yourdomain.com}"
EMAIL="${EMAIL:?Set EMAIL=you@email.com}"
SSL_DIR="./nginx/ssl"

echo "Setting up wildcard SSL for *.$DOMAIN and $DOMAIN"
echo "DNS challenge — you MUST have your DNS plugin configured."
echo ""

# Install certbot if not present
if ! command -v certbot &>/dev/null; then
  apt-get update -qq && apt-get install -y certbot
fi

# Issue certificate
# Replace '--dns-cloudflare' with your provider's plugin
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "*.$DOMAIN"

# Copy certs to nginx/ssl for docker volume mount
mkdir -p "$SSL_DIR"
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/fullchain.pem"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/privkey.pem"
chmod 640 "$SSL_DIR/privkey.pem"

echo ""
echo "Certificates copied to $SSL_DIR/"
echo "Next: docker compose restart nginx"
echo ""
echo "Auto-renewal: add to /etc/cron.d/certbot-renew:"
echo "  0 3 * * * root certbot renew --quiet && cp /etc/letsencrypt/live/$DOMAIN/*.pem $PWD/$SSL_DIR/ && docker compose -f $PWD/docker-compose.yml restart nginx"
