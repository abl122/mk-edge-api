const mongoose = require('mongoose');
require('dotenv').config();

// Conectar ao banco de dados
async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB:', mongoUri);
}

// Importar schemas
require('./src/app/schemas/Tenant');
require('./src/app/schemas/Plan');

async function fixValorMensal() {
  try {
    await connectDB();

    const Tenant = mongoose.model('Tenant');
    const Plan = mongoose.model('Plan');

    // Buscar todos os tenants com assinatura
    const tenants = await Tenant.find({ 'assinatura.plano': { $exists: true } });
    
    console.log(`\n📋 Encontrados ${tenants.length} tenants com assinatura\n`);

    let updated = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        const planSlug = tenant.assinatura.plano;
        const valorAtual = tenant.assinatura.valor_mensal;

        // Buscar o plano
        const plan = await Plan.findOne({ slug: planSlug });

        if (!plan) {
          console.log(`⚠️  Plano "${planSlug}" não encontrado para tenant ${tenant.provedor.nome}`);
          errors++;
          continue;
        }

        // Verificar se precisa atualizar
        if (valorAtual !== plan.valor_mensal) {
          console.log(`🔄 Atualizando: ${tenant.provedor.nome}`);
          console.log(`   Plano: ${plan.nome} (${planSlug})`);
          console.log(`   De: R$ ${(valorAtual || 0).toFixed(2)} → Para: R$ ${plan.valor_mensal.toFixed(2)}`);

          // Atualizar o valor
          tenant.assinatura.valor_mensal = plan.valor_mensal;
          await tenant.save();
          updated++;
        } else {
          console.log(`✅ OK: ${tenant.provedor.nome} - R$ ${plan.valor_mensal.toFixed(2)}`);
        }
      } catch (err) {
        console.error(`❌ Erro ao processar tenant ${tenant.provedor.nome}:`, err.message);
        errors++;
      }
    }

    console.log(`\n📊 Resumo:`);
    console.log(`   Total: ${tenants.length}`);
    console.log(`   Atualizados: ${updated}`);
    console.log(`   Erros: ${errors}`);
    console.log(`   Já corretos: ${tenants.length - updated - errors}`);

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

// Executar
fixValorMensal();
