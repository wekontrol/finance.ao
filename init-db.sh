#!/bin/bash
set -e

APP_DIR="${1:-.}"
ENV_FILE="$APP_DIR/.env.production"

# Criar .env.production se não existir
if [ ! -f "$ENV_FILE" ] || [ ! -s "$ENV_FILE" ]; then
    if [ -z "$DATABASE_URL" ]; then
        DB_PASS=$(head -c 100 /dev/urandom | LC_ALL=C tr -cd 'A-Za-z0-9' | head -c 16)
        DATABASE_URL="mysql://gestor_user:$DB_PASS@localhost:3306/gestor_financeiro"
    fi
    
    if [ -z "$SESSION_SECRET" ]; then
        SESSION_SECRET=$(head -c 100 /dev/urandom | LC_ALL=C tr -cd 'A-Za-z0-9' | head -c 32)
    fi
    
    cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
PORT=5000
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
ENVEOF

    chmod 600 "$ENV_FILE"
fi

# MySQL vai ser iniciado automaticamente pelo systemd
sleep 2
echo "✓ BD pronta"
