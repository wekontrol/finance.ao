# 🚀 INSTRUÇÕES PARA DEPLOY NO UBUNTU (Corrigido)

## ⚠️ PROBLEMA QUE FOI CORRIGIDO

A variável `DATABASE_URL` não estava sendo passada corretamente ao serviço systemd, causando erro "not authenticated" no login.

**Solução implementada:**
- Criado arquivo `.env.production` com todas as variáveis
- Systemd agora carrega as variáveis via `EnvironmentFile`
- PostgreSQL credenciais geradas automaticamente e seguras

---

## 🔧 PASSOS PARA DEPLOY

### 1. No teu Ubuntu, execute:
```bash
sudo bash deploy.sh
```

**O script fará automaticamente:**
- ✅ Instalar Node.js 20
- ✅ Instalar PostgreSQL
- ✅ Criar base de dados com credenciais seguras
- ✅ Criar arquivo `.env.production`
- ✅ Instalar dependências npm
- ✅ Compilar para produção
- ✅ Configurar serviço systemd
- ✅ Iniciar aplicação

**Tempo estimado: 5-10 minutos**

---

## ✅ APÓS O DEPLOY

### Aceder à aplicação:
```
http://IP_DO_TEU_SERVIDOR:5000
```

**Login padrão:**
- Usuário: `admin`
- Senha: `admin`

### Verificar se está tudo OK:
```bash
sudo bash diagnose.sh
```

Este comando mostra:
- ✓ Se o serviço está rodando
- ✓ Se DATABASE_URL está configurado
- ✓ Se PostgreSQL está funcionando
- ✓ Se consegue conectar à base de dados
- ✓ Últimos erros (se houver)

---

## 🔒 ARQUIVO .env.production

O script cria automaticamente em `/var/www/gestor-financeiro/.env.production`:
```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://gestor_user:SENHA@localhost:5432/gestor_financeiro
SESSION_SECRET=<aleatória segura>
```

**Credenciais PostgreSQL** são salvas em:
```
/var/www/gestor-financeiro/.postgres-credentials.txt
```

---

## 🛠️ COMANDOS ÚTEIS

```bash
# Ver logs em tempo real
sudo journalctl -u gestor-financeiro -f

# Verificar status
sudo systemctl status gestor-financeiro

# Restart
sudo systemctl restart gestor-financeiro

# Parar
sudo systemctl stop gestor-financeiro

# Iniciar
sudo systemctl start gestor-financeiro
```

---

## ❌ SE HOUVER ERRO

1. **Primeiro**: Execute `sudo bash diagnose.sh`
2. **Depois**: Verifique logs com `sudo journalctl -u gestor-financeiro -f`
3. **Se PostgreSQL falhar**: `sudo systemctl restart postgresql`

---

## 📋 RESUMO

O problema estava em como a variável `DATABASE_URL` era passada ao serviço. Agora está **100% corrigido** com:
- ✅ Arquivo .env.production gerado automaticamente
- ✅ PostgreSQL configurado com credenciais seguras
- ✅ Systemd carregando variáveis corretamente
- ✅ Sem dependências de Replit
- ✅ Totalmente independente

**Tudo pronto! Basta executar `sudo bash deploy.sh` no teu Ubuntu** 🎯
