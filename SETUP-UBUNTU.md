# Setup no Ubuntu - Guia Rápido

## ✅ Pré-requisitos

- Ubuntu 20.04+ (testado em Ubuntu 24.04 Noble)
- Acesso root/sudo
- Conexão internet

## 🚀 Instalação em 1 Comando

```bash
# No diretório do projeto (após git clone)
sudo bash install.sh
```

**É ISTO!** Tudo é automático.

---

## 🔧 Se der erro "Permission denied"

### Opção 1: Dar permissões manualmente
```bash
cd /home/usuario/finance.ao
chmod +x install.sh deploy.sh init-db.sh
sudo bash install.sh
```

### Opção 2: Dar permissões com sudo
```bash
sudo chmod +x install.sh deploy.sh init-db.sh
sudo bash install.sh
```

---

## 📋 O que o script faz

1. **Verifica permissões** de todos os scripts
2. **Limpa instalação anterior** (se existir)
3. **Executa deploy automático**:
   - Atualiza sistema (apt-get)
   - Instala Node.js 20
   - Cria utilizador `nodeapp`
   - Instala dependências npm
   - Compila frontend
   - Configura PostgreSQL
   - Cria serviço systemd
   - Inicia aplicação

---

## 📊 Resultado Final

Após conclusão:
- ✅ Aplicação em `http://[seu-ip]:5000`
- ✅ Credenciais: `admin` / `admin`
- ✅ Serviço systemd automático

---

## 🔍 Comandos Úteis

```bash
# Ver status
sudo systemctl status gestor-financeiro

# Ver logs em tempo real
sudo journalctl -u gestor-financeiro -f

# Restart
sudo systemctl restart gestor-financeiro

# Parar
sudo systemctl stop gestor-financeiro

# Iniciar
sudo systemctl start gestor-financeiro
```

---

## ❌ Se algo der errado

### Logs do serviço
```bash
sudo journalctl -u gestor-financeiro -n 50
```

### Verificar se PostgreSQL está rodando
```bash
sudo systemctl status postgresql
```

### Reiniciar do zero
```bash
sudo systemctl stop gestor-financeiro
sudo rm -rf /var/www/gestor-financeiro
sudo bash install.sh
```

---

## 📱 Acesso Remoto

Se quer aceder de outro computador:
```
http://[IP-DO-SERVIDOR]:5000
```

Encontrar IP:
```bash
hostname -I
```
