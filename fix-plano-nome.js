const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB');
}

require('./src/app/schemas/Tenant');
require('./src/app/schemas/Plan');

async function fixPlanoNome() {
  try {
    await connectDB();

    const Tenant = mongoose.model('Tenant');
    const Plan = mongoose.model('Plan');

    // Buscar todos os tenants
    const tenants = await Tenant.find({ 'assinatura.plano': { $exists: true } });
    
    console.log(`\n📋 Encontrados ${tenants.length} tenants\n`);

    for (const tenant of tenants) {
      const planoSlug = tenant.assinatura.plano;
      const planoNomeAtual = tenant.assinatura.plano_nome;
      
      // Buscar o plano
      const plan = await Plan.findOne({ slug: planoSlug });
      
      if (plan) {
        if (planoNomeAtual !== plan.nome) {
          console.log(`🔄 Corrigindo ${tenant.provedor.nome}:`);
          console.log(`   Slug: ${planoSlug}`);
          console.log(`   Nome atual: ${planoNomeAtual || '(vazio)'}`);
          console.log(`   Nome correto: ${plan.nome}`);
          
          tenant.assinatura.plano_nome = plan.nome;
          await tenant.save();
          console.log('   ✅ Atualizado!\n');
        } else {
          console.log(`✅ ${tenant.provedor.nome} - Já correto: ${plan.nome}`);
        }
      } else {
        console.log(`⚠️  ${tenant.provedor.nome} - Plano "${planoSlug}" não encontrado`);
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

fixPlanoNome();
