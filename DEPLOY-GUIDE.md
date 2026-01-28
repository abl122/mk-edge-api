# 🚀 GUIA DE DEPLOY - MK-EDGE

## 📋 CHECKLIST PRÉ-DEPLOY

### 1. Configuração do .env
Adicione no `.env` do servidor:

```bash
# MongoDB Remoto
MONGODB_REMOTE_URI=mongodb://usuario:senha@IP_SERVIDOR:27017/mkedgetenants

# Ou se usar autenticação
MONGODB_REMOTE_URI=mongodb://user:pass@172.31.255.2:27017/mkedgetenants?authSource=admin
```

### 2. Novos Campos Adicionados

**Schema Tenant:**
- ✅ `assinatura.plano_nome` (String) - Nome do plano atual
- ✅ `assinatura.status` (String) - Status da assinatura

**Novas Collections:**
- ✅ `plans` - Planos de assinatura separados do tenant
- ✅ `invoices` - Sistema de faturas
- ✅ `integrations` - Credenciais EFI e outras integrações

**Campos modificados:**
- ✅ `Plan.valor_mensal` (antes era `valor`)
- ✅ `Plan.periodo` - Agora aceita: mensal, semestral, anual, vitalicio

### 3. Dependências Novas
```bash
npm install node-cron --save
```

## 🔄 PROCESSO DE SINCRONIZAÇÃO

### Passo 1: Verificar dados locais
```bash
node check-plans.js
node debug-tenant.js
```

### Passo 2: Configurar URI remota
Edite o `.env` e adicione:
```
MONGODB_REMOTE_URI=mongodb://SEU_USUARIO:SENHA@IP:27017/mkedgetenants
```

### Passo 3: Fazer backup do remoto (IMPORTANTE!)
```bash
# No servidor remoto
mongodump --uri="mongodb://localhost:27017/mkedgetenants" --out=backup-$(date +%Y%m%d)
```

### Passo 4: Executar sincronização
```bash
node sync-to-remote.js
```

### Passo 5: Verificar sincronização
```bash
node verify-remote.js
```

## 🔧 DEPLOY DA API

### 1. No servidor, atualizar código:
```bash
cd mk-edge-api
git pull origin main
npm install
```

### 2. Verificar variáveis de ambiente:
```bash
cat .env
# Verificar:
# - MONGODB_URI
# - JWT_SECRET
# - EFI_CLIENT_ID
# - EFI_CLIENT_SECRET
# - PORT
```

### 3. Reiniciar serviço:
```bash
pm2 restart mk-edge-api
# ou
npm run dev
```

### 4. Verificar logs:
```bash
pm2 logs mk-edge-api
```

## 🌐 DEPLOY DO FRONTEND

### 1. Build do frontend:
```bash
cd hub-system
npm install
npm run build
```

### 2. Deploy (exemplo com nginx):
```bash
# Copiar dist para pasta do nginx
cp -r dist/* /var/www/hub-system/
```

### 3. Configuração nginx (exemplo):
```nginx
server {
    listen 80;
    server_name hub.mkedge.com.br;

    root /var/www/hub-system;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## ✅ VERIFICAÇÕES PÓS-DEPLOY

- [ ] API respondendo: `curl http://SEU_IP:5000/health`
- [ ] MongoDB conectado: verificar logs
- [ ] Login admin funcionando
- [ ] Login portal funcionando
- [ ] Criar novo provedor
- [ ] Visualizar planos
- [ ] Criar fatura teste
- [ ] Testar integração EFI (ambiente sandbox)

## 🚨 ROLLBACK (se necessário)

### Restaurar backup MongoDB:
```bash
mongorestore --uri="mongodb://localhost:27017/mkedgetenants" backup-YYYYMMDD/mkedgetenants
```

### Reverter código:
```bash
git checkout COMMIT_ANTERIOR
pm2 restart mk-edge-api
```

## 📝 NOTAS IMPORTANTES

1. **Certificados EFI**: 
   - Copiar `certificates/efi-homologacao.p12` e `efi-producao.p12`
   - Verificar permissões: `chmod 600 certificates/*.p12`

2. **Cron Jobs**: 
   - Verificar se estão rodando (logs mostram "Iniciando cron jobs")
   - Geração de faturas: dia 1 às 00:00
   - Marcar vencidas: diariamente às 06:00

3. **Logs**:
   - API: `mk-edge-api/logs/`
   - PM2: `pm2 logs mk-edge-api`

4. **Monitoramento**:
   - Verificar uso de memória/CPU
   - Monitorar conexões MongoDB
   - Verificar espaço em disco

## 📞 SUPORTE

Em caso de problemas:
1. Verificar logs da API
2. Verificar logs do MongoDB
3. Testar conexão: `node verify-remote.js`
4. Verificar variáveis de ambiente
5. Verificar firewall/portas abertas
