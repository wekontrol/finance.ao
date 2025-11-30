#!/bin/bash
set -e

echo "🔧 CORRIGINDO DEPLOY.SH - Removendo caracteres especiais de senhas"
echo ""

# Parar serviço
echo "1. Parando serviço..."
sudo systemctl stop gestor-financeiro 2>/dev/null || true

# Limpar BD antiga
echo "2. Limpando base de dados antiga..."
sudo -u postgres psql <<EOF || true
DROP DATABASE IF EXISTS gestor_financeiro;
DROP USER IF EXISTS gestor_user;
EOF

# Criar novo deploy.sh com gerador de senha CORRETO
echo "3. Criando novo deploy.sh com gerador alfanumérico..."
cd /home/herman/finance.ao

cat > deploy.sh << 'NEWEOF'
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
    sudo apt-get install -y postgresql postgresql-contrib
fi

sudo systemctl start postgresql || true
sudo systemctl enable postgresql || true

echo "Configurando base de dados PostgreSQL..."

DB_NAME="gestor_financeiro"
DB_USER="gestor_user"
DB_PASSWORD="$(head -c 100 /dev/urandom | LC_ALL=C tr -cd 'A-Za-z0-9' | head -c 16)"
DB_HOST="localhost"
DB_PORT="5432"

echo "  Senha gerada (alfanumérica): $DB_PASSWORD"

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
CREDENCIAIS DO POSTGRESQL
═══════════════════════════════════════════════════════════
Utilizador: $DB_USER
Senha: $DB_PASSWORD
Base de dados: $DB_NAME
Host: $DB_HOST
Porta: $DB_PORT
String de conexão: $POSTGRES_URL
═══════════════════════════════════════════════════════════
EOF

sudo chmod 600 $CREDS_FILE
sudo chown $APP_USER:$APP_USER $CREDS_FILE

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ PostgreSQL configurado!"
echo "═══════════════════════════════════════════════════════════"
echo "CREDENCIAIS: $DB_USER / $DB_PASSWORD"
echo ""

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

sudo tee /etc/systemd/system/gestor-financeiro.service > /dev/null <<'SYSTEMDEOF'
[Unit]
Description=Gestor Financeiro Familiar
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
    echo "✓ SUCESSO! Serviço iniciado!"
    echo "✓ URL: http://$(hostname -I | awk '{print $1}'):5000"
    echo "  Login: admin / admin"
else
    echo "✗ ERRO ao iniciar"
    sudo journalctl -u gestor-financeiro -n 50
    exit 1
fi
NEWEOF

chmod +x deploy.sh

# Executar novo deploy.sh
echo "4. Executando novo deploy.sh..."
sudo bash deploy.sh

echo ""
echo "5. Testando diagnóstico..."
sudo bash diagnose.sh

echo ""
echo "✓ FIX COMPLETO!"
