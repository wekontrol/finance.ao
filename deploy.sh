#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# Ensure this script has execution permissions
chmod +x "$0" 2>/dev/null || true

echo ">>> [1/7] Atualizando sistema..."
sudo apt-get update
sudo apt-get install -y curl git build-essential

echo ">>> [2/7] Configurando Git globalmente..."
git config --global --add safe.directory /var/www/gestor-financeiro
git config --global user.name "Deploy Script"
git config --global user.email "deploy@gestor-financeiro.local"

echo ">>> [3/7] Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo "Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js já instalado: $(node -v)"
fi

echo ">>> [4/7] Preparando diretório da aplicação..."
APP_DIR="/var/www/gestor-financeiro"
APP_USER="nodeapp"

if ! id "$APP_USER" &>/dev/null; then
    sudo useradd -m -s /bin/bash "$APP_USER"
    echo "Usuário $APP_USER criado"
fi

sudo mkdir -p $APP_DIR
sudo rm -rf $APP_DIR/*
sudo cp -r . $APP_DIR/
cd $APP_DIR
sudo chmod +x init-db.sh deploy.sh

echo ">>> [5/7] Instalando dependências npm..."
cd $APP_DIR

# Remove com sudo (não com sudo -u) para evitar permission denied
echo "Limpando dependências antigas..."
sudo rm -rf node_modules dist package-lock.json 2>/dev/null || true
echo "✓ Limpeza concluída"

echo "Instalando dependências npm..."
sudo -u $APP_USER npm install --legacy-peer-deps 2>&1 | tail -5 || {
    echo "ERRO: npm install falhou!"
    exit 1
}

echo "Compilando frontend..."
sudo -u $APP_USER npm run build 2>&1 | tail -5 || true

sudo chown -R $APP_USER:$APP_USER $APP_DIR
sudo chmod -R 755 $APP_DIR

echo ">>> [6/7] Configurando PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo "Instalando PostgreSQL..."
    sudo apt-get install -y postgresql postgresql-contrib
fi

sudo systemctl start postgresql || true
sudo systemctl enable postgresql || true
sleep 2

DB_NAME="gestor_financeiro"
DB_USER="gestor_user"
DB_PASSWORD="$(head -c 100 /dev/urandom | LC_ALL=C tr -cd 'A-Za-z0-9' | head -c 16)"
DB_HOST="localhost"
DB_PORT="5432"

sudo -u postgres psql <<EOF || true
DROP DATABASE IF EXISTS $DB_NAME;
DROP USER IF EXISTS $DB_USER;
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
ALTER USER $DB_USER CREATEDB;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

POSTGRES_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

SESSION_SECRET="$(head -c 100 /dev/urandom | LC_ALL=C tr -cd 'A-Za-z0-9' | head -c 32)"

ENV_FILE="$APP_DIR/.env.production"
sudo tee $ENV_FILE > /dev/null <<ENVEOF
NODE_ENV=production
PORT=5000
DATABASE_URL=$POSTGRES_URL
SESSION_SECRET=$SESSION_SECRET
ENVEOF

sudo chmod 600 $ENV_FILE
sudo chown $APP_USER:$APP_USER $ENV_FILE

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ PostgreSQL configurado!"
echo "Utilizador: $DB_USER"
echo "Base de dados: $DB_NAME"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo ">>> [7/7] Finalizando configuração..."

# Fix any permission issues
sudo chmod +x $APP_DIR/init-db.sh $APP_DIR/deploy.sh 2>/dev/null || true
sudo chown -R $APP_USER:$APP_USER $APP_DIR/node_modules 2>/dev/null || true

echo "Criando serviço systemd..."
sudo tee /etc/systemd/system/gestor-financeiro.service > /dev/null <<'SYSTEMDEOF'
[Unit]
Description=Gestor Financeiro Familiar - Node.js Application
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/var/www/gestor-financeiro
EnvironmentFile=/var/www/gestor-financeiro/.env.production
ExecStartPre=/bin/bash /var/www/gestor-financeiro/init-db.sh /var/www/gestor-financeiro
ExecStart=/bin/bash -c 'cd /var/www/gestor-financeiro && npm start'
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gestor-financeiro
LimitNOFILE=65535
LimitNPROC=65535

[Install]
WantedBy=multi-user.target
SYSTEMDEOF

sudo systemctl daemon-reload
sudo systemctl enable gestor-financeiro
sudo systemctl start gestor-financeiro

sleep 3
if sudo systemctl is-active --quiet gestor-financeiro; then
    echo ""
    echo "✓ SUCESSO! Aplicação está rodando!"
    echo "✓ URL: http://$(hostname -I | awk '{print $1}'):5000"
    echo "✓ Credenciais: admin / admin"
    echo ""
    echo "Comandos:"
    echo "  Ver logs: sudo journalctl -u gestor-financeiro -f"
    echo "  Status: sudo systemctl status gestor-financeiro"
else
    echo "✗ ERRO ao iniciar o serviço!"
    sudo journalctl -u gestor-financeiro -n 30
    exit 1
fi
