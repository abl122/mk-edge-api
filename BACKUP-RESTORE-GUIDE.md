# Guia de Backup e Restore do MongoDB

## 📋 Visão Geral

Este guia documenta os processos de backup e restore do MongoDB para prevenir perda de dados durante deploys.

## ⚠️ Problema Identificado

Durante deploy, o MongoDB no servidor estava vazio, resultando em:
- App retornando erro 500: "Cannot read properties of null (reading 'usaAgente')"
- Tenant não encontrado no banco de dados
- Todos os dados de produção perdidos

**Causa Raiz**: Deploy sem backup/restore dos dados existentes.

## 🛡️ Solução Implementada

### 1. Volumes Persistentes (Docker)

O `docker-compose.yml` está configurado com volumes persistentes:

```yaml
volumes:
  mongo-data:
    driver: local
  mongo-config:
    driver: local

services:
  mongo:
    volumes:
      - mongo-data:/data/db
      - mongo-config:/data/configdb
```

**Importante**: Esses volumes preservam dados entre restarts do container, mas **NÃO** protegem contra:
- Comandos `docker-compose down -v` (remove volumes)
- Reinstalação do servidor
- Corrupção de dados
- Erros humanos

### 2. Backup Automático

#### Script: `backup-mongo.sh`

```bash
# Fazer backup manual
./backup-mongo.sh

# Backups são salvos em: ./backups/mongo/
# Formato: mkedge-backup-YYYYMMDD_HHMMSS.tar.gz
# Mantém: Últimos 7 backups (rotação automática)
```

#### Configurar Backup Automático (Cron)

**No servidor de produção:**

```bash
# 1. Copiar script para servidor
scp backup-mongo.sh root@172.31.255.4:/root/
ssh root@172.31.255.4 "chmod +x /root/backup-mongo.sh"

# 2. Criar diretório de backups
ssh root@172.31.255.4 "mkdir -p /root/backups/mongo"

# 3. Adicionar cron job
ssh root@172.31.255.4 "crontab -e"
```

Adicione a linha:
```cron
# Backup diário às 2h da manhã
0 2 * * * /root/backup-mongo.sh >> /var/log/mongo-backup.log 2>&1
```

Ou:
```cron
# Backup a cada 6 horas
0 */6 * * * /root/backup-mongo.sh >> /var/log/mongo-backup.log 2>&1
```

### 3. Restore de Backup

#### Script: `restore-mongo.sh`

```bash
# Listar backups disponíveis
ls -lh backups/mongo/

# Restaurar backup específico
./restore-mongo.sh backups/mongo/mkedge-backup-20231215_140530.tar.gz
```

O script irá:
1. ⚠️ Pedir confirmação (dados atuais serão sobrescritos)
2. Extrair backup
3. Copiar para container
4. Limpar dados antigos
5. Restaurar dados do backup
6. Limpar arquivos temporários

## 🚀 Procedimento de Deploy Seguro

### Antes do Deploy

```bash
# 1. Fazer backup do ambiente de produção
ssh root@172.31.255.4
cd /root
./backup-mongo.sh

# 2. Verificar se backup foi criado
ls -lh backups/mongo/ | tail -1

# 3. (Opcional) Baixar backup para local
exit
scp root@172.31.255.4:/root/backups/mongo/mkedge-backup-*.tar.gz ./backups/mongo/
```

### Durante o Deploy

```bash
# Se precisar recriar containers:
docker-compose down  # NÃO use -v (preserva volumes)
docker-compose up -d

# Verificar se dados persistiram
docker exec mk-edge-mongo mongosh localhost:27017/mkedgetenants --quiet --eval "db.tenants.countDocuments({})"
# Deve retornar: 1 (ou número de tenants que existiam)
```

### Após o Deploy (Se dados foram perdidos)

```bash
# Restaurar último backup
./restore-mongo.sh backups/mongo/$(ls -t backups/mongo/ | head -1)

# Verificar restauração
docker exec mk-edge-mongo mongosh localhost:27017/mkedgetenants --quiet --eval "
db.tenants.findOne({}, {name: 1, cnpj: 1})
"
```

## 📊 Verificação de Dados

### Script de Verificação Rápida

```bash
# No servidor
docker exec mk-edge-mongo mongosh localhost:27017/mkedgetenants --quiet --eval "
print('Tenants:', db.tenants.countDocuments({}));
print('Users:', db.users.countDocuments({}));
print('Plans:', db.plans.countDocuments({}));
print('Subscriptions:', db.subscriptions.countDocuments({}));
print('Integrations:', db.integrations.countDocuments({}));
"
```

Resultado esperado (mínimo):
```
Tenants: 1
Users: 1
Plans: 2
Subscriptions: 1
Integrations: 0
```

### Verificar Tenant Específico

Use o script: `check_tenant_server.sh`

```bash
ssh root@172.31.255.4 'bash -s' < check_tenant_server.sh
```

Deve retornar:
```
✅ TENANT ENCONTRADO!
ID: ObjectId('63dd998b885eb427c8c51958')
Nome: Updata Telecom
CNPJ: 04.038.227/0001-87
...
```

## 🔧 Comandos Úteis

### Backup Manual

```bash
# Local
./backup-mongo.sh

# No servidor (via SSH)
ssh root@172.31.255.4 '/root/backup-mongo.sh'
```

### Listar Backups

```bash
# Local
ls -lh backups/mongo/

# No servidor
ssh root@172.31.255.4 'ls -lh /root/backups/mongo/'
```

### Restaurar do Ambiente Local para Produção

```bash
# 1. Fazer backup local
./backup-mongo.sh

# 2. Copiar para servidor
scp backups/mongo/$(ls -t backups/mongo/ | head -1) root@172.31.255.4:/root/backups/mongo/

# 3. Restaurar no servidor
ssh root@172.31.255.4 'cd /root && ./restore-mongo.sh backups/mongo/$(ls -t backups/mongo/ | head -1)'
```

### Logs de Backup Automático

```bash
# Ver últimos logs
ssh root@172.31.255.4 'tail -50 /var/log/mongo-backup.log'

# Acompanhar em tempo real
ssh root@172.31.255.4 'tail -f /var/log/mongo-backup.log'
```

## 🚨 Troubleshooting

### Backup falha com "no space left"

```bash
# Limpar backups antigos manualmente
ssh root@172.31.255.4 'cd /root/backups/mongo && ls -t | tail -n +4 | xargs rm -f'

# Verificar espaço em disco
ssh root@172.31.255.4 'df -h'
```

### Container MongoDB não está rodando

```bash
# Verificar containers
docker ps -a | grep mongo

# Iniciar se parado
docker start mk-edge-mongo

# Ver logs se com erro
docker logs mk-edge-mongo --tail 50
```

### Restore não encontra dados

Verifique a estrutura do backup:
```bash
tar -tzf backups/mongo/mkedge-backup-YYYYMMDD_HHMMSS.tar.gz | head -20
```

Deve conter:
```
mkedge-backup-YYYYMMDD_HHMMSS/
mkedge-backup-YYYYMMDD_HHMMSS/mkedgetenants/
mkedge-backup-YYYYMMDD_HHMMSS/mkedgetenants/tenants.bson
mkedge-backup-YYYYMMDD_HHMMSS/mkedgetenants/users.bson
...
```

## 📝 Checklist de Deploy

- [ ] Fazer backup de produção ANTES do deploy
- [ ] Verificar se backup foi criado com sucesso
- [ ] Executar deploy sem usar `docker-compose down -v`
- [ ] Após deploy, verificar se dados persistiram
- [ ] Se dados foram perdidos, restaurar backup imediatamente
- [ ] Testar app em produção após deploy
- [ ] Verificar logs da aplicação

## 🔗 Referências

- Servidor: 172.31.255.4
- Container: mk-edge-mongo
- Database: mkedgetenants
- Tenant ID Updata: 63dd998b885eb427c8c51958
- Docker Compose: `mk-edge-api/docker-compose.yml`

## 📞 Suporte

Em caso de problemas:
1. Verificar logs: `docker logs mk-edge-api` e `docker logs mk-edge-mongo`
2. Verificar containers: `docker ps -a`
3. Verificar dados: Scripts de verificação acima
4. Restaurar último backup se necessário
