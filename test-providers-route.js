#!/usr/bin/env node
/**
 * Test listPublicProviders route without starting server
 * Usage: node test-providers-route.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function testProvidersRoute() {
  console.log('🧪 Testando rota /public/providers...\n');
  
  try {
    // Conectar ao MongoDB
    console.log(`📡 Conectando ao MongoDB: ${MONGODB_URL}`);
    await mongoose.connect(MONGODB_URL, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.log('✅ MongoDB conectado\n');

    // Carregar schema
    require('./src/app/schemas/Tenant');
    const Tenant = mongoose.model('Tenant');

    // Executar a query
    console.log('🔍 Buscando tenants com provedores ativos...');
    const tenants = await Tenant.find({
      'provedor.ativo': { $ne: false },
      'assinatura.ativa': true,
      'agente.url': { $exists: true, $nin: [null, ''] },
      'agente.token': { $exists: true, $nin: [null, ''] }
    })
      .select('_id provedor agente assinatura')
      .sort({ 'provedor.nome': 1 })
      .lean();

    console.log(`✅ ${tenants.length} tenants encontrados\n`);

    // Processar resposta
    const providers = tenants.map((tenant) => {
      const primaryColor = tenant?.provedor?.cores?.primaria;
      return {
        id: String(tenant._id),
        name: String(tenant?.provedor?.nome || 'Provedor'),
        agentUrl: String(tenant?.agente?.url || ''),
        logo: tenant?.provedor?.logo || null,
        primaryColor: primaryColor ? String(primaryColor) : 'verde',
        supportEmail: tenant?.provedor?.email ? String(tenant.provedor.email) : '',
        supportPhone: tenant?.provedor?.telefone ? String(tenant.provedor.telefone) : '',
        active: true
      };
    });

    console.log('📦 Resposta que seria retornada:');
    console.log(JSON.stringify({
      success: true,
      providers,
      total: providers.length
    }, null, 2));

    await mongoose.connection.close();
    console.log('\n✅ Teste concluído com sucesso!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erro durante teste:');
    console.error('  Tipo:', error.name);
    console.error('  Mensagem:', error.message);
    
    if (error.name === 'MongooseError' || error.name === 'MongoNetworkError') {
      console.error('\n💡 Dica: MongoDB pode não estar rodando. Inicie com:');
      console.error('   docker-compose up -d mongo');
    }
    
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  }
}

testProvidersRoute();
