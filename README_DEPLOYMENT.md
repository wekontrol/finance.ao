# Gestor Financeiro Familiar - Deployment Guide

## ✅ Sem Dependências do Replit

Este projeto **NÃO tem dependências com Replit**. É uma aplicação Node.js/React standard que funciona em qualquer servidor Linux.

### Stack:
- **Backend**: Express.js (Node.js)
- **Frontend**: React + Vite
- **Database**: PostgreSQL
- **Sem dependências de Replit**: ✓

## 🚀 Deploy no seu Servidor Linux

### Opção 1: Script Automático (Recomendado)

```bash
sudo bash deploy.sh
```

O script fará automaticamente:
1. ✅ Instalar Node.js 20
2. ✅ Instalar e configurar PostgreSQL
3. ✅ Clonar/copiar código
4. ✅ Instalar dependências npm
5. ✅ Compilar para produção
6. ✅ Configurar serviço systemd
7. ✅ Iniciar aplicação

### Opção 2: Deployment Manual

#### 1. Instalar Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 2. Instalar PostgreSQL
```bash
sudo apt-get install -y postgresql postgresql-contrib
```

#### 3. Criar Banco de Dados
```bash
sudo -u postgres psql <<EOF
CREATE USER gestor_user WITH PASSWORD 'sua_senha_aqui';
ALTER USER gestor_user CREATEDB;
CREATE DATABASE gestor_financeiro OWNER gestor_user;
