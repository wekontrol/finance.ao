# Deployment Automatizado - 100% Escalável

## Visão Geral

Sistema de deployment completamente automatizado que funciona em qualquer servidor Ubuntu sem intervenção manual.

## Arquitetura

### 1. `init-db.sh` - Inicializador Automático
- Executa **antes** de cada inicialização
- Cria `.env.production` automaticamente
- Verifica PostgreSQL e cria utilizador se necessário
- Sem erros de sessão, sem `userId` undefined

### 2. `deploy.sh` - Deploy 100% Automático
- 7 passos totalmente automatizados
- Senhas alfanuméricos sem caracteres especiais
- `.env.production` criado com segurança
- Systemd configurado corretamente

### 3. Validação em `server/index.ts`
- Verifica variáveis obrigatórias em produção
- Exit rápido se algo estiver missing
- Logs automáticos de sucesso/erro

## Como Usar

### Primeiro Deploy
```bash
cd /home/herman/finance.ao
sudo bash deploy.sh
```

Isso faz tudo:
- ✅ Sistema atualizado
- ✅ Node.js 20 instalado
- ✅ PostgreSQL criado
- ✅ `.env.production` gerado
- ✅ Serviço systemd configurado
- ✅ Aplicação iniciada

### Próximos Deploys (Git Pull)
```bash
cd /home/herman/finance.ao
git pull
sudo systemctl restart gestor-financeiro
```

O `init-db.sh` executa automaticamente e cuida de:
- Variáveis de ambiente
- Verificação de BD
- Inicialização de tabelas

## Escalabilidade

Para novo servidor:
```bash
git clone https://github.com/wekontrol/finance.ao.git
cd finance.ao
sudo bash deploy.sh
```

Pronto. Sem configuração extra.

## Monitoramento

```bash
# Status
sudo systemctl status gestor-financeiro

# Logs em tempo real
sudo journalctl -u gestor-financeiro -f

# Diagnóstico
sudo bash diagnose.sh
```
