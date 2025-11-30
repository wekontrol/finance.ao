#!/bin/bash
# Script para CORRIGIR problemas de permissão em instalações anteriores

set -e

echo "═══════════════════════════════════════════════════════════"
echo "Corrigindo Permissões - Gestor Financeiro Familiar"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "❌ Execute com sudo: sudo bash fix-permissions.sh"
    exit 1
fi

APP_DIR="/var/www/gestor-financeiro"

if [ ! -d "$APP_DIR" ]; then
    echo "❌ Instalação não encontrada em $APP_DIR"
    exit 1
fi

echo "[1/4] Parando serviço..."
systemctl stop gestor-financeiro 2>/dev/null || true
sleep 1

echo "[2/4] Removendo node_modules (com sudo para evitar permission denied)..."
sudo rm -rf $APP_DIR/node_modules $APP_DIR/dist $APP_DIR/package-lock.json 2>/dev/null || true

echo "[3/4] Ajustando permissões..."
chown -R nodeapp:nodeapp $APP_DIR 2>/dev/null || true
chmod -R 755 $APP_DIR 2>/dev/null || true
chmod +x $APP_DIR/init-db.sh $APP_DIR/deploy.sh 2>/dev/null || true

echo "[4/4] Reiniciando serviço..."
systemctl start gestor-financeiro || {
    echo "⚠️  Erro ao iniciar. Vê logs:"
    journalctl -u gestor-financeiro -n 20
    exit 1
}

sleep 2

if systemctl is-active --quiet gestor-financeiro; then
    echo ""
    echo "✅ PERMISSÕES CORRIGIDAS COM SUCESSO!"
    echo ""
    echo "Status:"
    systemctl status gestor-financeiro --no-pager
else
    echo "❌ Serviço não iniciou"
    journalctl -u gestor-financeiro -n 30
    exit 1
fi
