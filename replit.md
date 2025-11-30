# 🏠 Gestor Financeiro Familiar

## ⚠️ **IMPORTANTE: 100% INDEPENDENTE DO REPLIT - ZERO CUSTOS**

Este projeto **não depende de nada do Replit** após a instalação em Ubuntu.

---

## 🚀 **Deploy em Ubuntu (ÚNICA FORMA RECOMENDADA)**

```bash
git clone https://github.com/wekontrol/finance.ao
cd finance.ao
sudo bash install.sh
```

**Pronto!** Depois de 5-10 minutos em `http://[seu-ip]:5000` com `admin/admin`.

---

## ❌ **O QUE FOI REMOVIDO DO REPLIT**

✓ Removido: `@heyputer/puter.js` (dependência Replit)
✓ Removido: Código de IA do Puter (API externa)
✓ Removido: PostgreSQL do Replit (custos)
✓ Removido: Workflows do Replit (não necessários)

---

## ✅ **O QUE USA O UBUNTU**

- **PostgreSQL Local** (instalado automaticamente)
- **Node.js 20** (instalado automaticamente)
- **systemd Service** (gerenciamento automático)
- **PM2 Optional** (para gerenciamento avançado)

---

## 📋 **Arquitetura**

```
Frontend:   React + Vite + Tailwind (compilado em dist/)
Backend:    Express.js + TypeScript
Database:   PostgreSQL local (localhost:5432)
Deploy:     systemd service em Ubuntu
```

---

## 🛠️ **Desenvolvimento em Replit (OPCIONAL)**

Se quiser testar em Replit:

```bash
npm install
npm run dev
```

⚠️ **Nota**: Isto custa créditos Replit. Use apenas para desenvolvimento.

---

## 🔐 **Segurança**

- Passwords: bcryptjs (hasheadas)
- Sessions: PostgreSQL (connect-pg-simple)
- .env.production: Gerado automaticamente com secrets aleatórios
- Cookies: Secure (HTTPS em produção)

---

## 📞 **Comandos em Ubuntu**

```bash
# Ver status
sudo systemctl status gestor-financeiro

# Ver logs em tempo real
sudo journalctl -u gestor-financeiro -f

# Reiniciar
sudo systemctl restart gestor-financeiro

# Parar
sudo systemctl stop gestor-financeiro

# Iniciar
sudo systemctl start gestor-financeiro
```

---

## 🆘 **Se der erro "Permission denied"**

```bash
cd /var/www/gestor-financeiro
sudo bash fix-permissions.sh
```

---

## 📝 **Estrutura do Projeto**

```
/
├── src/                    # Frontend React/TypeScript
│   ├── components/
│   ├── pages/
│   └── App.tsx
├── server/                 # Backend Express/TypeScript
│   ├── routes/
│   ├── db/
│   └── index.ts
├── dist/                   # Frontend compilado (build)
├── package.json
├── deploy.sh              # Script de instalação Ubuntu
├── init-db.sh             # Inicializa PostgreSQL
└── fix-permissions.sh     # Fix de permissões
```

---

## 🎯 **Resumo Final**

| Feature | Status |
|---------|--------|
| Deploy Independente | ✅ 100% |
| Custos Replit | ❌ ZERO |
| PostgreSQL Local | ✅ Automático |
| Session Storage | ✅ BD Local |
| Multilíngue | ✅ PT/EN/ES/FR/etc |
| Credenciais Default | admin / admin |

---

**Tudo automatizado. Nenhum custo. Pronto para produção.** 🚀
