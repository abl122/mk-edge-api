#!/bin/bash
# Script de Backup Automático do MongoDB
# Execute: ./backup-mongo.sh

set -e

BACKUP_DIR="./backups/mongo"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="mkedge-backup-$TIMESTAMP"

echo "📦 Iniciando backup do MongoDB..."
echo "   Data: $(date)"
echo ""

# Criar diretório de backup
mkdir -p "$BACKUP_DIR"

# Fazer backup
echo "🔄 Executando mongodump..."
docker exec mk-edge-mongo /usr/bin/mongodump \
  --uri="mongodb://localhost:27017/mkedgetenants" \
  --out="/tmp/$BACKUP_FILE" \
  --quiet

# Copiar para host
echo "📋 Copiando backup para host..."
docker cp "mk-edge-mongo:/tmp/$BACKUP_FILE" "$BACKUP_DIR/"

# Comprimir
echo "🗜️  Comprimindo backup..."
cd "$BACKUP_DIR"
tar -czf "$BACKUP_FILE.tar.gz" "$BACKUP_FILE"
rm -rf "$BACKUP_FILE"

echo ""
echo "✅ Backup concluído: $BACKUP_DIR/$BACKUP_FILE.tar.gz"
echo ""

# Manter apenas os 7 backups mais recentes
echo "🧹 Limpando backups antigos (mantém últimos 7)..."
ls -t mkedge-backup-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm --

echo "✅ Processo finalizado!"
