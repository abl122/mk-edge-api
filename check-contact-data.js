#!/usr/bin/env node

/**
 * Script para garantir que todos os usuários tenham dados de contato
 * completos para recuperação de senha
 */

const mongoose = require('mongoose');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function main() {
  try {
    console.log('🔄 Verificando e atualizando dados de contato dos usuários...\n');
    
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');
    
    const User = mongoose.model('User', new mongoose.Schema({
      nome: String,
      email: String,
      telefone: String,
      celular: String,
      login: String,
      senha: String,
      roles: [String],
      tenant_id: mongoose.Schema.Types.ObjectId,
      ativo: Boolean,
      bloqueado: Boolean
    }, { collection: 'users', strict: false }));
    
    const users = await User.find({});
    
    console.log(`📊 Encontrados ${users.length} usuários\n`);
    console.log('========================================');
    console.log('📋 VERIFICAÇÃO DE DADOS DE CONTATO');
    console.log('========================================\n');
    
    let updatedCount = 0;
    
    for (const user of users) {
      console.log(`👤 ${user.nome} (${user.login})`);
      
      const issues = [];
      const updates = {};
      
      // Verifica email
      if (!user.email) {
        issues.push('❌ Email não definido');
        // Para admin, usar email padrão, para portal, deixar vazio para preenchimento manual
        if (user.roles?.includes('admin')) {
          updates.email = 'vendas@updata.com.br';
          console.log('   ⚠️  Email não definido - será definido como: vendas@updata.com.br');
        } else {
          console.log('   ⚠️  Email não definido - requer configuração manual');
        }
      } else {
        console.log(`   ✅ Email: ${user.email}`);
      }
      
      // Verifica telefone
      if (!user.telefone) {
        issues.push('⚠️  Telefone não definido (opcional)');
        console.log('   ⚠️  Telefone: não definido (opcional para recuperação)');
      } else {
        console.log(`   ✅ Telefone: ${user.telefone}`);
      }
      
      // Verifica celular
      if (!user.celular) {
        issues.push('❌ Celular não definido');
        console.log('   ⚠️  Celular não definido - requer configuração manual');
      } else {
        console.log(`   ✅ Celular: ${user.celular}`);
      }
      
      // Atualiza se necessário
      if (Object.keys(updates).length > 0) {
        Object.assign(user, updates);
        await user.save({ validateBeforeSave: false });
        updatedCount++;
        console.log('   ✅ Usuário atualizado!');
      }
      
      console.log('');
    }
    
    console.log('========================================');
    console.log('📊 RESUMO');
    console.log('========================================\n');
    console.log(`Total de usuários: ${users.length}`);
    console.log(`Atualizados: ${updatedCount}`);
    
    console.log('\n💡 RECOMENDAÇÕES:\n');
    console.log('Para recuperação de senha, os usuários devem ter:');
    console.log('  ✅ Email (obrigatório para recuperação via email)');
    console.log('  ✅ Celular (obrigatório para recuperação via SMS/WhatsApp)');
    console.log('  ⚠️  Telefone (opcional, pode ser usado como alternativa)\n');
    
    console.log('✅ Verificação concluída!');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Conexão fechada');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
