#!/usr/bin/env node

/**
 * Verifica dados de contato dos usuários sem fazer login
 */

const mongoose = require('mongoose');
require('./src/app/schemas/User');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function main() {
  try {
    console.log('========================================');
    console.log('📊 DADOS DE CONTATO DOS USUÁRIOS');
    console.log('========================================\n');
    
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');
    
    const User = mongoose.model('User');
    const users = await User.find({});
    
    for (const user of users) {
      const publicData = user.toPublic();
      
      console.log(`👤 ${publicData.nome}`);
      console.log('   Login:', publicData.login);
      console.log('   Roles:', publicData.roles?.join(', '));
      console.log('   Tenant:', publicData.tenant_id || 'NULL (admin)');
      console.log('\n   📞 Dados de Contato:');
      console.log('   -----------------------------------');
      console.log(`   Email: ${publicData.email || '❌ NÃO DEFINIDO'}`);
      console.log(`   Telefone: ${publicData.telefone || '⚠️  NÃO DEFINIDO'}`);
      console.log(`   Celular: ${publicData.celular || '❌ NÃO DEFINIDO'}`);
      
      console.log('\n   🔐 Recuperação de Senha:');
      const canRecover = [];
      if (publicData.email) canRecover.push('✅ Email');
      if (publicData.celular) canRecover.push('✅ SMS/WhatsApp');
      if (publicData.telefone) canRecover.push('✅ Telefone');
      
      if (canRecover.length > 0) {
        console.log(`   Métodos disponíveis: ${canRecover.join(', ')}`);
      } else {
        console.log('   ❌ NENHUM método disponível - URGENTE: adicionar email ou celular!');
      }
      
      console.log('\n   📝 Objeto completo retornado por toPublic():');
      console.log('   -----------------------------------');
      console.log(JSON.stringify(publicData, null, 2).split('\n').map(line => '   ' + line).join('\n'));
      console.log('\n========================================\n');
    }
    
    console.log('✅ Análise concluída!\n');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Conexão fechada\n');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
