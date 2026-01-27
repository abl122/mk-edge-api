const mongoose = require('mongoose');

const MONGODB_URL = 'mongodb://localhost:27017/mkedgetenants';

async function main() {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');
    
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).toArray();
    
    console.log('========================================');
    console.log('👥 USUÁRIOS NO BANCO DE DADOS');
    console.log('========================================\n');
    
    for (const user of users) {
      console.log(`📋 Usuário: ${user.nome}`);
      console.log(`   Login: ${user.login}`);
      console.log(`   Email: ${user.email || 'NÃO DEFINIDO'}`);
      console.log(`   Telefone: ${user.telefone || 'NÃO DEFINIDO'}`);
      console.log(`   Celular: ${user.celular || 'NÃO DEFINIDO'}`);
      console.log(`   Roles: ${user.roles?.join(', ') || 'nenhuma'}`);
      console.log(`   Tenant ID: ${user.tenant_id || 'NULL (admin global)'}`);
      console.log(`   Ativo: ${user.ativo}`);
      console.log(`   Bloqueado: ${user.bloqueado}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

main();
