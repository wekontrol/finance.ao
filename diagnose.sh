#!/bin/bash

echo "🔍 DIAGNÓSTICO DO GESTOR FINANCEIRO"
echo "═════════════════════════════════════════════"
echo ""

# 1. Verificar se o serviço está rodando
echo "1️⃣  Status do Serviço:"
sudo systemctl status gestor-financeiro --no-pager 2>/dev/null | grep Active || echo "  ✗ Serviço não encontrado"

# 2. Verificar DATABASE_URL
echo ""
echo "2️⃣  Variáveis de Ambiente:"
if [ -f /var/www/gestor-financeiro/.env.production ]; then
    echo "  ✓ Arquivo .env.production existe"
    echo "  DATABASE_URL está configurado:"
    grep "DATABASE_URL" /var/www/gestor-financeiro/.env.production | head -1
else
    echo "  ✗ Arquivo .env.production NÃO encontrado"
fi

# 3. Verificar PostgreSQL
echo ""
echo "3️⃣  PostgreSQL:"
if command -v psql &> /dev/null; then
    echo "  ✓ PostgreSQL instalado"
    sudo systemctl status postgresql --no-pager 2>/dev/null | grep Active || echo "  ✗ PostgreSQL não está rodando"
else
    echo "  ✗ PostgreSQL não está instalado"
fi

# 4. Verificar aplicação
echo ""
echo "4️⃣  Aplicação Node.js:"
if command -v node &> /dev/null; then
    echo "  ✓ Node.js: $(node -v)"
    echo "  ✓ NPM: $(npm -v)"
else
    echo "  ✗ Node.js não está instalado"
fi

# 5. Teste de conexão com BD
echo ""
echo "5️⃣  Teste de Conexão com Banco de Dados:"
if [ -f /var/www/gestor-financeiro/.env.production ]; then
    DB_URL=$(grep "DATABASE_URL" /var/www/gestor-financeiro/.env.production | cut -d'=' -f2)
    if psql "$DB_URL" -c "SELECT 1" &> /dev/null; then
        echo "  ✓ Conexão com banco de dados: OK"
    else
        echo "  ✗ Falha ao conectar ao banco de dados"
        echo "  Verifique se PostgreSQL está rodando e as credenciais estão corretas"
    fi
else
    echo "  ✗ Arquivo .env.production não encontrado"
fi

# 6. Ver últimos erros
echo ""
echo "6️⃣  Últimos Erros (últimos 10 linhas):"
sudo journalctl -u gestor-financeiro -n 10 --no-pager 2>/dev/null || echo "  (Nenhum log disponível)"

echo ""
echo "═════════════════════════════════════════════"
echo "Se tiver problemas, execute:"
echo "  sudo journalctl -u gestor-financeiro -f"
echo "para ver os logs em tempo real"
