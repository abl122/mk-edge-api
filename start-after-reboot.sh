#!/bin/bash
# Script para reconectar containers à rede internal_network após reboot

echo "🔄 Aguardando containers iniciarem..."
sleep 10

echo "🔌 Conectando mk-edge-api-new à rede internal_network..."
docker network connect internal_network mk-edge-api-new 2>/dev/null || echo "Já conectado"

echo "🔌 Conectando mk-edge-mongo-new à rede internal_network..."
docker network connect internal_network mk-edge-mongo-new 2>/dev/null || echo "Já conectado"

echo "✅ Containers reconectados com sucesso!"
