#!/bin/bash

# Script de Sincronização de Schema - MongoDB em Container Docker
# Execute no servidor: bash sync-users-docker.sh

echo ""
echo "========================================"
echo "🔄 SINCRONIZAÇÃO DE SCHEMA - Usuários"
echo "========================================"
echo ""

# Verifica se está no diretório correto
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Erro: docker-compose.yml não encontrado!"
    echo "   Execute este script do diretório raiz do projeto"
    exit 1
fi

# Verifica se os containers estão rodando
echo "🔍 Verificando containers..."
if ! docker ps | grep -q "mk-edge-mongo"; then
    echo "❌ Container mk-edge-mongo não está rodando!"
    exit 1
fi

if ! docker ps | grep -q "mk-edge-api"; then
    echo "❌ Container mk-edge-api não está rodando!"
    exit 1
fi

echo "✅ Containers OK"
echo ""

# Opção de fazer backup
read -p "Fazer backup antes de continuar? (s/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "📦 Criando backup..."
    mkdir -p /backup
    BACKUP_DIR="/backup/mkedge-$(date +%Y%m%d-%H%M%S)"
    
    docker exec mk-edge-mongo mongodump \
        --uri="mongodb://localhost:27017/mkedgetenants" \
        --out=/dump
    
    docker cp mk-edge-mongo:/dump "$BACKUP_DIR"
    echo "✅ Backup salvo em: $BACKUP_DIR"
    echo ""
fi

# Executa o script de sincronização
echo "🚀 Executando sincronização..."
echo ""

docker-compose exec mk-edge-api node sync-user-schema.js

echo ""
echo "========================================"
echo "✅ Processo concluído!"
echo "========================================"
echo ""
