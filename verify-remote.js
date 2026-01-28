const mongoose = require('mongoose');
require('dotenv').config();

const REMOTE_URI = process.env.MONGODB_REMOTE_URI || 'mongodb://usuario:senha@IP:27017/mkedgetenants';

async function verifyRemoteSchema() {
  try {
    console.log('🔍 Verificando schemas no servidor REMOTO\n');

    const conn = await mongoose.createConnection(REMOTE_URI).asConnected;
    console.log('✅ Conectado ao MongoDB REMOTO\n');

    // Verificar collections
    const collections = await conn.db.listCollections().toArray();
    console.log('📦 Collections encontradas:');
    collections.forEach(c => console.log(`   - ${c.name}`));

    // Verificar campos importantes em Tenants
    console.log('\n\n📋 Amostra de Tenant (verificando campos novos):');
    const Tenant = conn.model('Tenant', require('./src/app/schemas/Tenant').schema);
    const tenant = await Tenant.findOne({});
    
    if (tenant) {
      console.log('\n✅ Campos em assinatura:');
      console.log(`   - plano: ${tenant.assinatura?.plano || 'AUSENTE'}`);
      console.log(`   - plano_nome: ${tenant.assinatura?.plano_nome || 'AUSENTE ❌'}`);
      console.log(`   - valor_mensal: ${tenant.assinatura?.valor_mensal || 'AUSENTE'}`);
      console.log(`   - status: ${tenant.assinatura?.status || 'AUSENTE'}`);
      console.log(`   - data_fim: ${tenant.assinatura?.data_fim || 'AUSENTE'}`);
    }

    // Verificar Plans
    console.log('\n\n📦 Plans:');
    const Plan = conn.model('Plan', require('./src/app/schemas/Plan').schema);
    const plans = await Plan.find({});
    console.log(`   Total: ${plans.length} planos`);
    plans.forEach(p => {
      console.log(`   - ${p.nome}: R$ ${p.valor_mensal?.toFixed(2)} (${p.slug})`);
    });

    // Verificar Invoices
    console.log('\n\n💰 Invoices:');
    const Invoice = conn.model('Invoice', require('./src/app/schemas/Invoice').schema);
    const invoices = await Invoice.find({});
    console.log(`   Total: ${invoices.length} faturas`);

    // Verificar Integrations
    console.log('\n\n🔌 Integrations:');
    const Integration = conn.model('Integration', require('./src/app/schemas/Integration').schema);
    const integrations = await Integration.find({});
    console.log(`   Total: ${integrations.length} integrações`);

    await conn.close();
    console.log('\n\n👋 Verificação concluída');

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    process.exit(1);
  }
}

verifyRemoteSchema();
