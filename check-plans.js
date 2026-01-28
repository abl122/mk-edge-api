const mongoose = require('mongoose');
require('dotenv').config();

// Conectar ao banco de dados
async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB:', mongoUri);
}

// Importar schemas
require('./src/app/schemas/Plan');

async function checkPlans() {
  try {
    await connectDB();

    const Plan = mongoose.model('Plan');

    // Buscar todos os planos
    const plans = await Plan.find({});
    
    console.log(`\n📋 Planos cadastrados: ${plans.length}\n`);

    for (const plan of plans) {
      console.log(`📦 ${plan.nome}`);
      console.log(`   Slug: ${plan.slug}`);
      console.log(`   Valor: ${plan.valor !== undefined ? `R$ ${plan.valor.toFixed(2)}` : 'INDEFINIDO'}`);
      console.log(`   Ativo: ${plan.ativo ? 'Sim' : 'Não'}`);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Conexão fechada');
  }
}

// Executar
checkPlans();
