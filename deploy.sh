#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

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
sudo chown -R root:root $APP_DIR
sudo chmod 755 $APP_DIR

echo ">>> [5/7] Clonando/Copiando código e instalando dependências..."
sudo cp -r . $APP_DIR/
cd $APP_DIR

sudo chown -R $APP_USER:$APP_USER $APP_DIR
sudo chmod -R u+rwX $APP_DIR

sudo -u $APP_USER sh -c 'rm -rf node_modules && rm -rf dist && rm -f package-lock.json'
sudo -u $APP_USER npm install
sudo -u $APP_USER npm run build

sudo chown -R $APP_USER:$APP_USER $APP_DIR
sudo chmod -R 755 $APP_DIR

echo ">>> [6/7] Configurando PostgreSQL e serviço systemd..."

if ! command -v psql &> /dev/null; then
    echo "Instalando PostgreSQL..."
    sudo apt-get install -y postgresql postgresql-contrib
fi

echo "Iniciando PostgreSQL..."
sudo systemctl start postgresql || true
sudo systemctl enable postgresql || true

echo "Configurando base de dados PostgreSQL..."

DB_NAME="gestor_financeiro"
DB_USER="gestor_user"
DB_PASSWORD="$(head -c 100 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 16)"
DB_HOST="localhost"
DB_PORT="5432"

sudo -u postgres psql <<EOF || true
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
ALTER USER $DB_USER CREATEDB;
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

POSTGRES_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

CREDS_FILE="$APP_DIR/.postgres-credentials.txt"
sudo tee $CREDS_FILE > /dev/null <<EOF
═══════════════════════════════════════════════════════════
CREDENCIAIS DO POSTGRESQL - GUARDAR COM SEGURANÇA
═══════════════════════════════════════════════════════════
Utilizador: $DB_USER
Senha: $DB_PASSWORD
Base de dados: $DB_NAME
Host: $DB_HOST
Porta: $DB_PORT

String de conexão:
$POSTGRES_URL
═══════════════════════════════════════════════════════════
EOF

sudo chmod 600 $CREDS_FILE
sudo chown $APP_USER:$APP_USER $CREDS_FILE

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ PostgreSQL configurado automaticamente!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "CREDENCIAIS GERADAS:"
echo "  Utilizador: $DB_USER"
echo "  Senha: $DB_PASSWORD"
echo "  String de conexão: $POSTGRES_URL"
echo ""

SESSION_SECRET="$(head -c 100 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 32)"

ENV_FILE="$APP_DIR/.env.production"
sudo tee $ENV_FILE > /dev/null <<ENVEOF
NODE_ENV=production
PORT=5000
DATABASE_URL=$POSTGRES_URL
SESSION_SECRET=$SESSION_SECRET
ENVEOF

sudo chmod 600 $ENV_FILE
sudo chown $APP_USER:$APP_USER $ENV_FILE

sudo tee /etc/systemd/system/gestor-financeiro.service > /dev/null <<'SYSTEMDEOF'
[Unit]
Description=Gestor Financeiro Familiar - Node.js Application
After=network.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/var/www/gestor-financeiro
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
LimitNOFILE=65535
LimitNPROC=65535
EnvironmentFile=/var/www/gestor-financeiro/.env.production

[Install]
WantedBy=multi-user.target
SYSTEMDEOF

sudo systemctl daemon-reload
sudo systemctl enable gestor-financeiro

echo ">>> [7/7] Iniciando serviço..."
sudo systemctl start gestor-financeiro

sleep 3
if sudo systemctl is-active --quiet gestor-financeiro; then
    echo ""
    echo "✓ SUCESSO! Serviço iniciado com sucesso!"
    echo "✓ Acesse a aplicação em: http://$(hostname -I | awk '{print $1}'):5000"
    echo ""
    echo "Credenciais padrão:"
    echo "  Usuário: admin"
    echo "  Senha: admin"
    echo ""
    echo "Comandos úteis:"
    echo "  Ver logs: sudo journalctl -u gestor-financeiro -f"
    echo "  Restart: sudo systemctl restart gestor-financeiro"
    echo "  Status: sudo systemctl status gestor-financeiro"
else
    echo "✗ ERRO ao iniciar o serviço!"
    echo "Verificando logs..."
    sudo journalctl -u gestor-financeiro -n 50
    exit 1
fi
