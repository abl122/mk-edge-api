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

async function updatePlanValues() {
  try {
    await connectDB();

    const Plan = mongoose.model('Plan');

    // Atualizar plano mensal para R$ 49,00
    const mensal = await Plan.findOne({ slug: 'assinatura-mensal' });
    if (mensal) {
      mensal.valor_mensal = 49.00;
      await mensal.save();
      console.log('✅ Plano Assinatura Mensal atualizado para R$ 49,00');
    }

    // Atualizar plano vitalício para R$ 999,00
    const vitalicio = await Plan.findOne({ slug: 'plano-vitalicio' });
    if (vitalicio) {
      vitalicio.valor_mensal = 999.00;
      await vitalicio.save();
      console.log('✅ Plano Vitalício atualizado para R$ 999,00');
    }

    console.log('\n📦 Planos atualizados:');
    const plans = await Plan.find({});
    for (const plan of plans) {
      console.log(`   ${plan.nome}: R$ ${plan.valor_mensal.toFixed(2)}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

// Executar
updatePlanValues();
