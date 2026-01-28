const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB');
}

require('./src/app/schemas/Plan');

async function fixPrices() {
  try {
    await connectDB();

    const Plan = mongoose.model('Plan');

    // Corrigir valor do Plano Básico
    const basico = await Plan.findOne({ slug: 'plano-mensal-basico' });
    if (basico) {
      basico.valor_mensal = 49.00;
      await basico.save();
      console.log('✅ Plano Mensal Básico: R$ 49,00');
    }

    // Verificar Plano Padrão
    const padrao = await Plan.findOne({ slug: 'plano-mensal-padrao' });
    if (padrao) {
      console.log('✅ Plano Mensal Padrão: R$', padrao.valor_mensal.toFixed(2));
    }

    // Verificar Vitalício
    const vitalicio = await Plan.findOne({ slug: 'plano-vitalicio' });
    if (vitalicio) {
      vitalicio.valor_mensal = 999.00;
      await vitalicio.save();
      console.log('✅ Plano Vitalício: R$ 999,00');
    }

    console.log('\n📦 Resumo final:');
    const plans = await Plan.find({}).sort({ valor_mensal: 1 });
    for (const p of plans) {
      console.log(`   ${p.nome}: R$ ${p.valor_mensal.toFixed(2)} (${p.slug})`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

fixPrices();
