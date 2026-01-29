#!/bin/bash
# Script de Restore do MongoDB
# Execute: ./restore-mongo.sh <arquivo-backup.tar.gz>

set -e

if [ -z "$1" ]; then
  echo "❌ Erro: Especifique o arquivo de backup"
  echo "Uso: ./restore-mongo.sh backups/mongo/mkedge-backup-YYYYMMDD_HHMMSS.tar.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Erro: Arquivo não encontrado: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  ATENÇÃO: Este processo irá SOBRESCREVER os dados atuais do MongoDB!"
echo "   Backup: $BACKUP_FILE"
echo ""
read -p "Continuar? (sim/não): " confirm

if [ "$confirm" != "sim" ]; then
  echo "❌ Operação cancelada"
  exit 0
fi

echo ""
echo "📦 Extraindo backup..."
TEMP_DIR=$(mktemp -d)
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

BACKUP_DIR=$(ls -d "$TEMP_DIR"/mkedge-backup-* 2>/dev/null | head -1)

if [ -z "$BACKUP_DIR" ]; then
  echo "❌ Erro: Estrutura de backup inválida"
  rm -rf "$TEMP_DIR"
  exit 1
fi

echo "🔄 Copiando backup para container..."
docker cp "$BACKUP_DIR" mk-edge-mongo:/tmp/restore-backup

echo "🗑️  Limpando dados antigos..."
docker exec mk-edge-mongo mongosh localhost:27017/mkedgetenants --quiet --eval "
db.tenants.deleteMany({});
db.plans.deleteMany({});
db.users.deleteMany({});
db.integrations.deleteMany({});
db.subscriptions.deleteMany({});
db.invoices.deleteMany({});
"

echo "📥 Restaurando dados..."
docker exec mk-edge-mongo /usr/bin/mongorestore \
  --dir="/tmp/restore-backup" \
  --verbose

echo "🧹 Limpando arquivos temporários..."
docker exec mk-edge-mongo rm -rf /tmp/restore-backup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Restore concluído com sucesso!"
echo ""
