const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB');
}

require('./src/app/schemas/Tenant');
require('./src/app/schemas/Plan');

async function checkData() {
  try {
    await connectDB();

    const Tenant = mongoose.model('Tenant');
    const Plan = mongoose.model('Plan');

    const updata = await Tenant.findOne({ 'provedor.nome': /updata/i });
    
    console.log('\n📋 TENANT UPDATA - DADOS COMPLETOS:\n');
    console.log('_id:', updata._id);
    console.log('Provedor:', updata.provedor.nome);
    
    console.log('\n🔍 Assinatura (objeto completo):');
    console.log(JSON.stringify(updata.assinatura, null, 2));
    
    console.log('\n🔍 Campos específicos:');
    console.log('   assinatura.plano:', updata.assinatura?.plano);
    console.log('   assinatura.plano_id:', updata.assinatura?.plano_id);
    console.log('   assinatura.valor_mensal:', updata.assinatura?.valor_mensal);
    console.log('   plano_atual:', updata.plano_atual);
    
    console.log('\n📦 PLANOS DISPONÍVEIS:');
    const plans = await Plan.find({});
    for (const p of plans) {
      console.log(`\n   ${p.nome}:`);
      console.log(`      _id: ${p._id}`);
      console.log(`      slug: ${p.slug}`);
      console.log(`      valor_mensal: ${p.valor_mensal}`);
      console.log(`      periodo: ${p.periodo}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkData();
