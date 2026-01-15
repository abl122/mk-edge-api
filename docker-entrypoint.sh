#!/bin/sh
set -e

echo "🚀 Iniciando MK-Edge Backend..."

# Função para aguardar MongoDB
wait_for_mongo() {
  echo "⏳ Aguardando MongoDB estar disponível..."
  
  max_attempts=30
  attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    if node -e "
      const mongoose = require('mongoose');
      mongoose.connect('${MONGODB_URL}', { serverSelectionTimeoutMS: 3000 })
        .then(() => { 
          console.log('✅ MongoDB conectado!');
          mongoose.disconnect();
          process.exit(0);
        })
        .catch(() => process.exit(1));
    " 2>/dev/null; then
      return 0
    fi
    
    attempt=$((attempt + 1))
    echo "   Tentativa $attempt/$max_attempts..."
    sleep 2
  done
  
  echo "❌ MongoDB não ficou disponível em tempo hábil"
  exit 1
}

# Aguarda MongoDB
wait_for_mongo

# Executa inicialização do tenant
echo ""
echo "🌱 Executando inicialização do tenant..."
if node scripts/init-tenant.js; then
  echo "✅ Tenant inicializado com sucesso!"
else
  echo "⚠️  Aviso: Falha na inicialização do tenant (pode já estar configurado)"
fi

echo ""
echo "🎯 Iniciando servidor da API..."
echo ""

# Inicia a aplicação
exec "$@"
