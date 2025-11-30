#!/bin/bash

# Parar se houver erro
set -e

# Configuração não interativa para apt
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

# Criar usuário se não existir
if ! id "$APP_USER" &>/dev/null; then
    sudo useradd -m -s /bin/bash "$APP_USER"
    echo "Usuário $APP_USER criado"
fi

# Criar diretório
sudo mkdir -p $APP_DIR
sudo chown -R root:root $APP_DIR
sudo chmod 755 $APP_DIR

echo ">>> [5/7] Clonando/Copiando código e instalando dependências..."
# Copiar arquivos atuais para APP_DIR
sudo cp -r . $APP_DIR/
cd $APP_DIR

# Ajustar permissões para instalação
sudo chown -R $APP_USER:$APP_USER $APP_DIR
sudo chmod -R u+rwX $APP_DIR

# Limpar cache antigo
sudo -u $APP_USER sh -c 'rm -rf node_modules && rm -rf dist && rm -f package-lock.json'

# Instalar como o usuário da aplicação
sudo -u $APP_USER npm install

# Compilar para produção
sudo -u $APP_USER npm run build

# Garantir permissões corretas após build
sudo chown -R $APP_USER:$APP_USER $APP_DIR
sudo chmod -R 755 $APP_DIR

echo ">>> [6/7] Configurando PostgreSQL e serviço systemd..."

# Verificar se PostgreSQL está disponível
if ! command -v psql &> /dev/null; then
    echo "Instalando PostgreSQL..."
    sudo apt-get install -y postgresql postgresql-contrib
fi

# Iniciar serviço PostgreSQL
echo "Iniciando PostgreSQL..."
sudo systemctl start postgresql || true
sudo systemctl enable postgresql || true

# Configurar PostgreSQL automaticamente
echo "Configurando base de dados PostgreSQL..."

# Nome da base de dados e usuário
DB_NAME="gestor_financeiro"
DB_USER="gestor_user"
DB_PASSWORD="$(openssl rand -base64 16)"  # Senha aleatória segura
DB_HOST="localhost"
DB_PORT="5432"

# Criar usuário e base de dados
sudo -u postgres psql <<EOF || true
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
ALTER USER $DB_USER CREATEDB;
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

# Gerar string de conexão
POSTGRES_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Salvar credenciais num ficheiro seguro
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

# Mostrar credenciais durante a configuração
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✓ PostgreSQL configurado automaticamente!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "CREDENCIAIS GERADAS (guardar num local seguro):"
echo "  Utilizador: $DB_USER"
echo "  Senha: $DB_PASSWORD"
echo "  Base de dados: $DB_NAME"
echo "  Host: $DB_HOST"
echo "  Porta: $DB_PORT"
echo ""
echo "String de conexão:"
echo "  $POSTGRES_URL"
echo ""
echo "⚠️  As credenciais foram salvas em: .postgres-credentials.txt"
echo ""

POSTGRES_ENV="Environment=\"DATABASE_URL=$POSTGRES_URL\""

# Cria arquivo de serviço systemd
sudo tee /etc/systemd/system/gestor-financeiro.service > /dev/null <<EOF
[Unit]
Description=Gestor Financeiro Familiar - Node.js Application
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Limites de recursos
LimitNOFILE=65535
LimitNPROC=65535

Environment="NODE_ENV=production"
Environment="PORT=5000"
$POSTGRES_ENV

[Install]
WantedBy=multi-user.target
EOF

# Habilita e inicia o serviço
sudo systemctl daemon-reload
sudo systemctl enable gestor-financeiro

echo ">>> [7/7] Iniciando serviço..."
sudo systemctl start gestor-financeiro

# Verifica se o serviço está rodando
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
    echo "  Ver logs em tempo real: sudo journalctl -u gestor-financeiro -f"
    echo "  Restart da aplicação: sudo systemctl restart gestor-financeiro"
    echo "  Status do serviço: sudo systemctl status gestor-financeiro"
    echo "  Parar aplicação: sudo systemctl stop gestor-financeiro"
else
    echo "✗ ERRO ao iniciar o serviço!"
    echo "Verificando logs..."
    sudo journalctl -u gestor-financeiro -n 50
    exit 1
fi
