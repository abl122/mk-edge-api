const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB:', mongoUri);
}

require('./src/app/schemas/Tenant');
require('./src/app/schemas/Plan');

async function checkUpdata() {
  try {
    await connectDB();

    const Tenant = mongoose.model('Tenant');
    const Plan = mongoose.model('Plan');

    const updata = await Tenant.findOne({ 'provedor.nome': /updata/i });
    
    if (!updata) {
      console.log('❌ Tenant Updata não encontrado');
      return;
    }

    console.log('\n📋 Dados da Updata Telecom:\n');
    console.log('Provedor:', updata.provedor.nome);
    console.log('CNPJ:', updata.provedor.cnpj);
    
    console.log('\n📦 Assinatura:');
    console.log('   Plano (slug):', updata.assinatura.plano);
    console.log('   Status:', updata.assinatura.status);
    console.log('   Valor Mensal (stored):', updata.assinatura.valor_mensal);
    console.log('   Data Início:', updata.assinatura.data_inicio);
    
    // Buscar o plano real
    if (updata.assinatura.plano) {
      const plan = await Plan.findOne({ slug: updata.assinatura.plano });
      if (plan) {
        console.log('\n✅ Plano encontrado:');
        console.log('   Nome:', plan.nome);
        console.log('   Slug:', plan.slug);
        console.log('   Valor Mensal:', plan.valor_mensal);
        console.log('   Período:', plan.periodo);
        
        if (plan.valor_mensal !== updata.assinatura.valor_mensal) {
          console.log('\n⚠️  INCONSISTÊNCIA DETECTADA!');
          console.log('   Stored:', updata.assinatura.valor_mensal);
          console.log('   Plan:', plan.valor_mensal);
        }
      } else {
        console.log('\n❌ Plano não encontrado:', updata.assinatura.plano);
      }
    }

    console.log('\n📊 Todos os planos disponíveis:');
    const plans = await Plan.find({});
    for (const p of plans) {
      console.log(`   - ${p.nome} (${p.slug}): R$ ${p.valor_mensal} - ${p.periodo}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

checkUpdata();
