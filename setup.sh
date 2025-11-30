#!/bin/bash
#######################################
# SETUP ÚNICO - Execute uma única vez
#######################################
set -e

echo "🚀 Iniciando setup autónomo..."

# 1. Limpar git locks
cd /var/www/gestor-financeiro 2>/dev/null || mkdir -p /var/www/gestor-financeiro && cd /var/www/gestor-financeiro
sudo rm -f .git/index.lock

# 2. Se não é repo git, clonar
if [ ! -d ".git" ]; then
    echo "📦 Clonando repositório..."
    sudo rm -rf * .env.* 2>/dev/null || true
    sudo git clone https://github.com/wekontrol/finance.ao .
fi

# 3. Reset git (ignora conflitos)
sudo git reset --hard HEAD
sudo git pull origin main --force

# 4. Dar permissões
sudo chmod +x deploy.sh init-db.sh

# 5. EXECUTAR DEPLOY (faz TUDO: MySQL, database, build, start)
echo ""
echo "⚙️  Executando deploy automático..."
echo "════════════════════════════════════"
sudo bash deploy.sh

echo ""
echo "✅ SETUP COMPLETO!"
echo "   URL: http://$(hostname -I | awk '{print $1}'):5000"
echo "   Login: admin / admin"
echo ""
echo "Próximas atualizações:"
echo "   cd /var/www/gestor-financeiro && git pull origin main && sudo systemctl restart gestor-financeiro"
