#!/bin/bash
set -e

APP_DIR="${1:-.}"
ENV_FILE="$APP_DIR/.env.production"

# Criar .env.production se não existir
if [ ! -f "$ENV_FILE" ] || [ ! -s "$ENV_FILE" ]; then
    if [ -z "$DATABASE_URL" ]; then
        DB_PASS=$(head -c 100 /dev/urandom | LC_ALL=C tr -cd 'A-Za-z0-9' | head -c 16)
        DATABASE_URL="postgresql://gestor_user:$DB_PASS@localhost:5432/gestor_financeiro"
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

# Garantir que PostgreSQL está rodando
if ! sudo systemctl is-active --quiet postgresql 2>/dev/null; then
    sudo systemctl start postgresql 2>/dev/null || true
fi

# Aguardar PostgreSQL (max 30s)
for i in {1..30}; do
    if sudo -u postgres psql -c "SELECT 1" > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

echo "✓ BD pronta"
