#!/bin/bash
# SCRIPT DE INSTALAÇÃO - Execute isto PRIMEIRO no Ubuntu

set -e

echo "═══════════════════════════════════════════════════════════"
echo "Gestor Financeiro Familiar - Script de Instalação"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Verificar se é root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Este script DEVE ser executado com sudo"
    echo "Execute: sudo bash install.sh"
    exit 1
fi

# Paso 1: Garantir permissões dos scripts
echo "[1/3] Garantindo permissões dos scripts..."
chmod +x deploy.sh init-db.sh 2>/dev/null || true
ls -la deploy.sh init-db.sh | awk '{print "  ✓", $NF, "(" $1 ")"}'
echo ""

# Passo 2: Limpar deploy anterior (optional)
echo "[2/3] Preparando sistema..."
if [ -d "/var/www/gestor-financeiro" ]; then
    echo "  Removendo instalação anterior..."
    systemctl stop gestor-financeiro 2>/dev/null || true
    rm -rf /var/www/gestor-financeiro
fi
echo ""

# Passo 3: Executar deploy
echo "[3/3] Executando deploy automático..."
echo ""
bash deploy.sh

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ INSTALAÇÃO COMPLETA!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Acesse em: http://$(hostname -I | awk '{print $1}'):5000"
echo "Credenciais: admin / admin"
echo ""
