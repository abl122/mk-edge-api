const mongoose = require('mongoose');

async function main() {
  try {
    const conn = await mongoose.createConnection(
      process.env.MONGODB_URL || 'mongodb://mongo:27017/mkedgetenants'
    ).asPromise();
    
    console.log('\n========================================');
    console.log('INTEGRACOES COMPLETAS - BANCO REMOTO');
    console.log('========================================\n');
    
    const db = conn.db;
    const integrations = await db.collection('integrations').find({}).toArray();
    
    console.log(`Total: ${integrations.length} integracoes\n`);
    
    for (const integration of integrations) {
      console.log(`\n--- ${integration.type} ---`);
      console.log(JSON.stringify(integration, null, 2));
      console.log('\n');
    }
    
    await conn.close();
  } catch (error) {
    console.error('ERRO:', error.message);
    process.exit(1);
  }
}

main();
