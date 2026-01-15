# Guia de Deploy - MK-Edge Backend v2

## 📋 Pré-requisitos

- Docker 20.10+
- Docker Compose 2.0+
- Servidor Linux (recomendado Ubuntu 20.04+)

## 🚀 Deploy em Produção

### 1. Configuração Inicial

Clone o repositório no servidor:
```bash
git clone <repository-url>
cd mk-edge-backend-v2
```

### 2. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo e configure:
```bash
cp .env.example .env
nano .env
```

**Variáveis obrigatórias para alterar:**
- `JWT_SECRET`: Gere uma chave secreta forte
- `MONGO_ROOT_PASSWORD`: Senha segura para o MongoDB
- `NODE_ENV`: Deixe como `production`

**Gerar JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Build e Start

```bash
# Build das imagens
docker-compose build

# Iniciar os serviços
docker-compose up -d

# Verificar logs
docker-compose logs -f app
```

### 4. Verificar Status

```bash
# Status dos containers
docker-compose ps

# Health check
curl http://localhost:3333/health
```

### 5. Setup Inicial (Primeira vez)

Criar tenant e usuário admin:
```bash
# Acessar container
docker-compose exec app sh

# Executar scripts de setup
npm run seed:tenant
npm run seed

# Sair do container
exit
```

## 🔄 Atualizações

```bash
# Parar serviços
docker-compose down

# Atualizar código
git pull

# Rebuild e restart
docker-compose build
docker-compose up -d
```

## 🔧 Manutenção

### Logs
```bash
# Logs da API
docker-compose logs -f app

# Logs do MongoDB
docker-compose logs -f mongo
```

### Backup do MongoDB
```bash
# Criar backup
docker-compose exec mongo mongodump --out /data/backup

# Copiar backup para host
docker cp mk-edge-mongo:/data/backup ./backup-$(date +%Y%m%d)
```

### Restaurar Backup
```bash
# Copiar backup para container
docker cp ./backup mk-edge-mongo:/data/backup

# Restaurar
docker-compose exec mongo mongorestore /data/backup
```

## 🔒 Segurança em Produção

### 1. Firewall
```bash
# Permitir apenas portas necessárias
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### 2. Reverse Proxy (Nginx)

Recomenda-se usar Nginx como reverse proxy com SSL:

```nginx
server {
    listen 80;
    server_name api.seu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. SSL com Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.seu-dominio.com
```

## 📊 Monitoramento

### Health Check Endpoint
```bash
curl http://localhost:3333/health
```

### Logs em tempo real
```bash
docker-compose logs -f --tail=100 app
```

## 🐛 Troubleshooting

### Container não inicia
```bash
# Ver logs de erro
docker-compose logs app

# Verificar configuração
docker-compose config
```

### MongoDB connection error
```bash
# Verificar se MongoDB está rodando
docker-compose ps mongo

# Testar conexão
docker-compose exec mongo mongosh
```

### Reiniciar serviços
```bash
# Reiniciar apenas a API
docker-compose restart app

# Reiniciar tudo
docker-compose restart
```

## 📝 Comandos Úteis

```bash
# Ver containers rodando
docker-compose ps

# Parar tudo
docker-compose down

# Parar e remover volumes (CUIDADO: apaga dados)
docker-compose down -v

# Rebuild completo
docker-compose build --no-cache

# Limpar recursos não utilizados
docker system prune -a
```

## 🔄 CI/CD

Exemplo de workflow GitHub Actions em `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/mk-edge-backend-v2
            git pull
            docker-compose build
            docker-compose up -d
```

## 📞 Suporte

Para problemas ou dúvidas, consulte a documentação completa ou abra uma issue no repositório.
