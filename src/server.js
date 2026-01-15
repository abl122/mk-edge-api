// ==================== IMPORTS ====================
require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');

// ==================== CONFIGURAÇÕES ====================
const PORT = process.env.PORT || 3333;
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

// ==================== REGISTRO DE MODELS ====================
// Os Services usam mongoose.model('Tenant') ao invés de importar diretamente
require('./app/schemas/Tenant');
require('./app/schemas/User');

// ==================== FUNÇÕES AUXILIARES ====================
/**
 * Conecta ao MongoDB
 */
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log('✅ MongoDB conectado');
    console.log(`📦 Database: ${MONGODB_URL}`);
  } catch (err) {
    console.error('❌ Erro ao conectar ao MongoDB:', err.message);
    console.error('💡 Verifique se o MongoDB está rodando (docker-compose up)');
    process.exit(1);
  }
}

/**
 * Inicia o servidor HTTP
 */
function startServer() {
  app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Servidor Nova API MK-Edge');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🌍 URL: http://localhost:${PORT}`);
    console.log(`🎯 Agente: ${process.env.AGENT_DEFAULT_URL || 'não configurado'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}

/**
 * Graceful shutdown
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n👋 ${signal} recebido. Encerrando servidor...`);
    
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB desconectado');
      process.exit(0);
    } catch (err) {
      console.error('❌ Erro ao desconectar:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
}

// ==================== INICIALIZAÇÃO ====================
(async () => {
  await connectDatabase();
  startServer();
  setupGracefulShutdown();
})();
