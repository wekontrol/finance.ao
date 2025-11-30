#!/bin/bash
# Inicialização automática da BD - Rodeia antes do npm start
set -e

APP_DIR="${1:-.}"
ENV_FILE="$APP_DIR/.env.production"

# Se o .env.production não existir ou estiver vazio, criar novo
if [ ! -f "$ENV_FILE" ] || [ ! -s "$ENV_FILE" ]; then
    echo "⚙️ Inicializando .env.production..."
    
    # Verificar se as variáveis já estão definidas (para reutilizar)
    if [ -z "$DATABASE_URL" ]; then
        DB_PASS=$(head -c 100 /dev/urandom | LC_ALL=C tr -cd 'A-Za-z0-9' | head -c 16)
        DATABASE_URL="postgresql://gestor_user:$DB_PASS@localhost:5432/gestor_financeiro"
    fi
    
    if [ -z "$SESSION_SECRET" ]; then
        SESSION_SECRET=$(head -c 100 /dev/urandom | LC_ALL=C tr -cd 'A-Za-z0-9' | head -c 32)
    fi
    
    # Criar .env.production
    cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
PORT=5000
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
ENVEOF

    chmod 600 "$ENV_FILE"
    echo "✅ .env.production criado"
fi

# Garantir que PostgreSQL está rodando
echo "⚙️ Verificando PostgreSQL..."
if ! sudo systemctl is-active --quiet postgresql 2>/dev/null; then
    echo "🔧 Iniciando PostgreSQL..."
    sudo systemctl start postgresql 2>/dev/null || true
fi

# Aguardar PostgreSQL ficar pronto (max 30s)
POSTGRES_READY=0
for i in {1..30}; do
    if sudo -u postgres psql -c "SELECT 1" > /dev/null 2>&1; then
        POSTGRES_READY=1
        break
    fi
    sleep 1
done

if [ $POSTGRES_READY -eq 0 ]; then
    echo "✗ PostgreSQL não respondeu"
    exit 1
fi

# Verificar se gestor_user existe, se não criar
if ! sudo -u postgres psql -c "SELECT 1 FROM pg_user WHERE usename='gestor_user'" | grep -q "1"; then
    echo "🔧 Criando utilizador PostgreSQL..."
    DB_PASS=$(echo $DATABASE_URL | sed 's/.*:\([^@]*\)@.*/\1/')
    
    sudo -u postgres psql <<EOF
CREATE USER gestor_user WITH PASSWORD '$DB_PASS';
ALTER USER gestor_user CREATEDB;
DROP DATABASE IF EXISTS gestor_financeiro;
CREATE DATABASE gestor_financeiro OWNER gestor_user;
GRANT ALL PRIVILEGES ON DATABASE gestor_financeiro TO gestor_user;
EOF
fi

echo "✅ BD pronta"
