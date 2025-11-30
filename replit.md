# Gestor Financeiro Familiar

## 📋 Resumo
Plataforma de gestão financeira familiar com React, TypeScript, Express.js e PostgreSQL.
**Deploy independente em Ubuntu Linux - ZERO custos do Replit após instalação.**

## 🚀 Deploy em Ubuntu

```bash
git clone https://github.com/wekontrol/finance.ao
cd finance.ao
sudo bash install.sh
```

Acesse em `http://[seu-ip]:5000` com `admin/admin`.

## ⚠️ IMPORTANTE - Remover Custos do Replit

Este projeto **não usa PostgreSQL do Replit**. Para remover custos:

1. Em Replit: "Tools" → "Database" → "Delete Database"
2. Isto **para todos os custos**
3. O código continua a funcionar em Ubuntu (usa DB local)

## 📚 Arquitetura

- **Frontend**: React + TypeScript + Vite + Tailwind
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (local em Ubuntu)
- **Deploy**: systemd service em Ubuntu Linux

## 🔧 Estrutura do Projeto

```
/
├── src/
│   ├── components/    # React components
│   ├── pages/         # Páginas
│   ├── styles/        # CSS
│   └── App.tsx
├── server/
│   ├── routes/        # Express routes
│   ├── db/            # Database config
│   └── index.ts
├── package.json
├── deploy.sh          # Script de deployment
└── init-db.sh         # Inicialização da BD
```

## 🛠️ Desenvolvimento Replit (se usar)

```bash
npm run dev
```

Aplicação em `http://localhost:5000`

## 📝 Notas de Implementação

- **Session Storage**: Usa PostgreSQL (connect-pg-simple)
- **Autenticação**: Passwords com bcryptjs
- **Multilíngue**: Suporta PT-AO, PT-PT, EN
- **Credenciais Default**: admin / admin (alterar em produção)

## 🔐 Segurança em Produção

- `.env.production` é gerado automaticamente com secrets aleatórios
- Passwords hasheadas com bcryptjs
- Sessions em PostgreSQL
- Cookies secure em HTTPS

## 📞 Suporte

- Logs: `sudo journalctl -u gestor-financeiro -f`
- Status: `sudo systemctl status gestor-financeiro`
- Reiniciar: `sudo systemctl restart gestor-financeiro`

---

**Última atualização:** 2025-11-30
**Versão:** 1.0.3
