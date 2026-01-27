#!/usr/bin/env node

/**
 * Script para atualizar dados de contato de um usuário específico
 * 
 * Uso:
 * node update-user-contact.js LOGIN EMAIL CELULAR [TELEFONE]
 * 
 * Exemplo:
 * node update-user-contact.js admin admin@mk-edge.com.br 92991424261
 * node update-user-contact.js 04038227000187 provedor@email.com.br 92991111111 9231234567
 */

const mongoose = require('mongoose');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function updateUserContact(login, email, celular, telefone = null) {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Busca o usuário
    const user = await usersCollection.findOne({ login });
    
    if (!user) {
      console.error(`❌ Usuário com login "${login}" não encontrado!`);
      process.exit(1);
    }
    
    console.log(`👤 Usuário encontrado: ${user.nome}\n`);
    console.log('📋 Dados atuais:');
    console.log(`   Email: ${user.email || 'NÃO DEFINIDO'}`);
    console.log(`   Celular: ${user.celular || 'NÃO DEFINIDO'}`);
    console.log(`   Telefone: ${user.telefone || 'NÃO DEFINIDO'}`);
    
    // Monta o update
    const updateData = {
      email: email.toLowerCase().trim(),
      celular: celular.trim()
    };
    
    if (telefone) {
      updateData.telefone = telefone.trim();
    }
    
    // Atualiza também o email_recovery se existir recuperacao_senha
    if (user.recuperacao_senha) {
      updateData['recuperacao_senha.email_recovery'] = email.toLowerCase().trim();
    }
    
    console.log('\n📝 Novos dados:');
    console.log(`   Email: ${updateData.email}`);
    console.log(`   Celular: ${updateData.celular}`);
    if (telefone) {
      console.log(`   Telefone: ${updateData.telefone}`);
    }
    
    // Aplica a atualização
    const result = await usersCollection.updateOne(
      { _id: user._id },
      { $set: updateData }
    );
    
    if (result.modifiedCount > 0) {
      console.log('\n✅ Usuário atualizado com sucesso!');
      
      // Verifica o resultado
      const updatedUser = await usersCollection.findOne({ _id: user._id });
      console.log('\n📋 Verificação final:');
      console.log(`   Email: ${updatedUser.email}`);
      console.log(`   Celular: ${updatedUser.celular}`);
      console.log(`   Telefone: ${updatedUser.telefone || 'NÃO DEFINIDO'}`);
    } else {
      console.log('\n⚠️  Nenhuma alteração foi feita (dados já estavam atualizados)');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Conexão fechada');
  }
}

// Processa argumentos da linha de comando
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('❌ Uso incorreto!\n');
  console.log('Uso:');
  console.log('  node update-user-contact.js LOGIN EMAIL CELULAR [TELEFONE]\n');
  console.log('Exemplos:');
  console.log('  node update-user-contact.js admin admin@mk-edge.com.br 92991424261');
  console.log('  node update-user-contact.js 04038227000187 provedor@email.com.br 92991111111 9231234567');
  process.exit(1);
}

const [login, email, celular, telefone] = args;

updateUserContact(login, email, celular, telefone)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
  });
