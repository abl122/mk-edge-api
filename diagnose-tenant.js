const mongoose = require('mongoose');

async function main() {
  try {
    const conn = await mongoose.createConnection(
      process.env.MONGODB_URL || 'mongodb://mongo:27017/mkedgetenants'
    ).asPromise();
    
    console.log('\n========================================');
    console.log('DIAGNOSTICO TENANT E INTEGRACOES');
    console.log('========================================\n');
    
    const db = conn.db;
    
    // Lista tenants
    const tenants = await db.collection('tenants').find({}).toArray();
    console.log(`Tenants encontrados: ${tenants.length}\n`);
    
    for (const tenant of tenants) {
      console.log(`Tenant: ${tenant.nome || tenant.name}`);
      console.log(`ID: ${tenant._id}`);
      console.log(`CNPJ: ${tenant.cnpj}`);
      console.log(`---`);
      
      // Busca integrações desse tenant
      const integrations = await db.collection('integrations').find({
        tenant_id: tenant._id
      }).toArray();
      
      console.log(`\nIntegracoes deste tenant: ${integrations.length}`);
      
      for (const int of integrations) {
        console.log(`  - ${int.type}: ${int[int.type]?.enabled ? 'Habilitado' : 'Desabilitado'}`);
      }
      
      // Verifica se há integrações sem tenant_id
      const noTenant = await db.collection('integrations').find({
        tenant_id: { $exists: false }
      }).toArray();
      
      if (noTenant.length > 0) {
        console.log(`\n⚠️  Integracoes SEM tenant_id: ${noTenant.length}`);
        for (const int of noTenant) {
          console.log(`  - ${int.type} (ID: ${int._id})`);
        }
      }
      
      // Verifica integrações com ObjectId vs String
      const allInts = await db.collection('integrations').find({}).toArray();
      console.log('\n--- Analise de tenant_id ---');
      for (const int of allInts) {
        const tid = int.tenant_id;
        console.log(`${int.type}: ${typeof tid} - ${tid}`);
      }
    }
    
    await conn.close();
  } catch (error) {
    console.error('ERRO:', error.message);
    process.exit(1);
  }
}

main();
