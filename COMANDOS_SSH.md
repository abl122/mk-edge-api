# Comandos para Gerenciar MongoDB via SSH

## 🔐 Acessar o Servidor

```bash
ssh root@172.31.255.4
```

## 📊 Verificar Estado dos Containers

```bash
# Listar containers ativos
docker ps

# Ver logs do MongoDB
docker logs mk-edge-mongo --tail 50

# Ver logs da API
docker logs mk-edge-api --tail 50
```

## 🔍 Verificar Usuários no MongoDB

### Método 1: Script Shell (recomendado)

```bash
# Na sua máquina local, copie o script para o servidor:
scp mk-edge-api/remote-check-users.sh root@172.31.255.4:/tmp/

# No servidor, execute:
ssh root@172.31.255.4 "bash /tmp/remote-check-users.sh"
```

### Método 2: Comando Direto

```bash
# Listar todos os usuários
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval 'db.users.find().forEach(printjson)'"

# Contar usuários
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval 'db.users.countDocuments()'"

# Ver usuário específico
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval 'db.users.findOne({login: \"admin\"})'"
```

### Método 3: Mongosh Interativo

```bash
# Acessar o container do MongoDB
ssh root@172.31.255.4
docker exec -it mk-edge-mongo mongosh mkedgetenants

# Dentro do mongosh:
db.users.find().pretty()
db.users.countDocuments()
db.users.findOne({login: "admin"})
exit
```

## 🔄 Sincronizar Dados do Local para Remoto

### Opção 1: Script Automático (recomendado)

```bash
# Na sua máquina local:
cd mk-edge-api
bash remote-sync-from-local.sh
```

### Opção 2: Manual

```bash
# 1. Na máquina local, exportar dados
mongoexport --db=mkedgetenants --collection=users --out=users-export.json --jsonArray

# 2. Copiar para o servidor
scp users-export.json root@172.31.255.4:/tmp/

# 3. No servidor, importar
ssh root@172.31.255.4 << 'EOF'
  # Backup primeiro
  docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=users --out=/tmp/users-backup.json --jsonArray
  
  # Importar dados
  docker cp /tmp/users-export.json mk-edge-mongo:/tmp/
  docker exec mk-edge-mongo mongoimport --db=mkedgetenants --collection=users --file=/tmp/users-export.json --jsonArray --drop
EOF
```

## ✏️ Atualizar Campos Específicos

### Adicionar email e celular a um usuário

```bash
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval '
db.users.updateOne(
  { login: \"admin\" },
  { \$set: { 
    email: \"vendas@updata.com.br\",
    celular: \"92991424261\"
  }}
)
'"
```

### Adicionar email_recovery para todos os usuários sem email

```bash
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval '
db.users.updateMany(
  { email: { \$exists: false }, \"recuperacao_senha.email_recovery\": { \$exists: true } },
  [{ 
    \$set: { 
      email: \"\$recuperacao_senha.email_recovery\"
    }
  }]
)
'"
```

### Adicionar celular de recuperacao_senha para todos sem celular

```bash
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval '
db.users.updateMany(
  { celular: { \$exists: false }, \"recuperacao_senha.celular\": { \$exists: true } },
  [{ 
    \$set: { 
      celular: \"\$recuperacao_senha.celular\"
    }
  }]
)
'"
```

## 🗑️ Operações de Limpeza

### Fazer backup antes de qualquer alteração

```bash
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongodump --db=mkedgetenants --out=/tmp/backup-\$(date +%Y%m%d-%H%M%S)"
```

### Remover todos os usuários (CUIDADO!)

```bash
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval 'db.users.deleteMany({})'"
```

### Restaurar backup

```bash
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongorestore --db=mkedgetenants /tmp/backup-YYYYMMDD-HHMMSS/mkedgetenants"
```

## 📋 Comparar Local vs Remoto

```bash
# Na sua máquina local:
echo "=== LOCAL ==="
mongo mkedgetenants --quiet --eval "db.users.find({}, {nome:1, email:1, celular:1, login:1}).forEach(printjson)"

echo ""
echo "=== REMOTO ==="
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval 'db.users.find({}, {nome:1, email:1, celular:1, login:1}).forEach(printjson)'"
```

## 🔧 Executar Script Node.js no Servidor

```bash
# Copiar script para o servidor
scp mk-edge-api/sync-user-schema.js root@172.31.255.4:/opt/mk-edge/mk-edge-api/

# Executar no container da API
ssh root@172.31.255.4 "docker exec mk-edge-api node sync-user-schema.js"
```

## 📊 Verificação Rápida de Saúde

```bash
ssh root@172.31.255.4 "docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval '
print(\"=== RESUMO DO BANCO ===\");
print(\"Total de usuários: \" + db.users.countDocuments());
print(\"Com email: \" + db.users.countDocuments({email: {\$exists: true}}));
print(\"Com celular: \" + db.users.countDocuments({celular: {\$exists: true}}));
print(\"Admin: \" + db.users.countDocuments({roles: \"admin\"}));
print(\"Portal: \" + db.users.countDocuments({roles: \"portal\"}));
print(\"\");
print(\"=== USUÁRIOS ===\");
db.users.find({}, {nome:1, email:1, celular:1, login:1, roles:1}).forEach(u => {
  print(u.nome + \" (\" + u.login + \")\");
  print(\"  Email: \" + (u.email || \"❌\"));
  print(\"  Celular: \" + (u.celular || \"❌\"));
  print(\"  Roles: \" + JSON.stringify(u.roles));
  print(\"\");
});
'
"
```
