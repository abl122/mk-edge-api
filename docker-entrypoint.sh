#!/bin/bash
set -e

# Script de inicialização do container mk-edge-api
# Executa o script de inicialização do tenant e depois inicia o servidor

# Se o script de inicialização existir, executa
if [ -f "/app/src/scripts/init-tenant.js" ]; then
    echo "🌱 Executando inicialização do tenant..."
    if node /app/src/scripts/init-tenant.js; then
        echo "✅ Tenant inicializado com sucesso!"
    else
        echo "⚠️  Aviso: Falha na inicialização do tenant (pode já estar configurado)"
    fi
else
    echo "ℹ️  Script de inicialização não encontrado, pulando..."
fi

# Executar o comando passado (por padrão: node src/server.js)
echo "🎯 Iniciando servidor da API..."
exec "$@"
