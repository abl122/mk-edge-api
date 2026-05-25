#!/bin/bash
# Script de Deploy Seguro com Backup Automático
# Execute: ./safe-deploy.sh

set -e

echo "🚀 DEPLOY SEGURO MK-EDGE API"
echo "=============================="
echo ""

# 1. Verificar se está no servidor
if [ ! -f "docker-compose.yml" ]; then
  echo "❌ Erro: docker-compose.yml não encontrado"
  echo "   Execute este script no diretório mk-edge-api"
  exit 1
fi

# 2. Fazer backup antes do deploy
echo "📦 Passo 1/5: Criando backup do MongoDB..."
if [ -f "./backup-mongo.sh" ]; then
  ./backup-mongo.sh
  if [ $? -ne 0 ]; then
    echo "❌ Erro ao criar backup!"
    echo "   Deseja continuar mesmo assim? (sim/não)"
    read confirm
    if [ "$confirm" != "sim" ]; then
      exit 1
    fi
  fi
else
  echo "⚠️  Script backup-mongo.sh não encontrado, pulando backup..."
fi

echo ""
echo "🛑 Passo 2/5: Parando containers..."
docker-compose stop

echo ""
echo "📥 Passo 3/5: Atualizando imagem base do Mongo..."
docker-compose pull mongo

echo ""
echo "🔄 Passo 4/5: Rebuild da API e recriando containers..."
# Rebuild da API para garantir que alterações locais (src/) entrem na imagem.
# NÃO usar -v para preservar volumes.
docker-compose build --no-cache app
docker-compose up -d --force-recreate

echo ""
echo "⏳ Aguardando containers iniciarem..."
sleep 10

echo ""
echo "✅ Passo 5/5: Verificando dados..."

# Verificar se MongoDB tem dados
TENANT_COUNT=$(docker exec mk-edge-mongo mongosh localhost:27017/mkedgetenants --quiet --eval "db.tenants.countDocuments({})" 2>/dev/null || echo "0")

if [ "$TENANT_COUNT" = "0" ]; then
  echo "⚠️  ATENÇÃO: MongoDB está vazio após deploy!"
  echo ""
  echo "Deseja restaurar o último backup? (sim/não)"
  read restore_confirm
  
  if [ "$restore_confirm" = "sim" ]; then
    LAST_BACKUP=$(ls -t backups/mongo/*.tar.gz 2>/dev/null | head -1)
    if [ -z "$LAST_BACKUP" ]; then
      echo "❌ Nenhum backup encontrado em backups/mongo/"
      exit 1
    fi
    
    echo "📥 Restaurando backup: $LAST_BACKUP"
    ./restore-mongo.sh "$LAST_BACKUP"
  else
    echo "⚠️  Deploy concluído mas MongoDB está vazio!"
    echo "   Execute manualmente: ./restore-mongo.sh backups/mongo/ARQUIVO.tar.gz"
    exit 1
  fi
fi

echo ""
echo "📊 Status dos dados:"
docker exec mk-edge-mongo mongosh localhost:27017/mkedgetenants --quiet --eval "
print('Tenants:', db.tenants.countDocuments({}));
print('Users:', db.users.countDocuments({}));
print('Plans:', db.plans.countDocuments({}));
print('Subscriptions:', db.subscriptions.countDocuments({}));
"

echo ""
echo "🎉 Deploy concluído com sucesso!"
echo ""
echo "📝 Próximos passos:"
echo "   1. Testar aplicação: curl https://mk-edge.com.br/api/health"
echo "   2. Verificar logs: docker logs mk-edge-api --tail 50"
echo "   3. Testar app mobile em produção"
echo ""
