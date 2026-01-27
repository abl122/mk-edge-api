#!/usr/bin/env node

/**
 * Script de Migração - Adiciona dados de contato aos usuários
 * 
 * Execute este script DIRETAMENTE no servidor remoto:
 * ssh root@172.31.255.4
 * cd /path/to/mk-edge-api
 * node migrate-add-contact-data.js
 */

const mongoose = require('mongoose');

// Configuração do MongoDB (ajuste se necessário)
// Local: mongodb://localhost:27017/mkedgetenants
// Remoto: mongodb://172.26.0.2:27017/mkedgetenants
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function main() {
  try {
    console.log('========================================');
    console.log('🔄 MIGRAÇÃO: Adicionando Dados de Contato');
    console.log('========================================\n');
    
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Busca todos os usuários
    const users = await usersCollection.find({}).toArray();
    console.log(`📊 Encontrados ${users.length} usuários\n`);
    
    let updatedCount = 0;
    const updates = [];
    
    for (const user of users) {
      console.log(`\n👤 Processando: ${user.nome} (${user.login})`);
      
      const updateFields = {};
      let needsUpdate = false;
      
      // Verifica e adiciona email se não existir
      if (!user.email) {
        console.log('   ⚠️  Email não definido');
        
        // Para usuários admin, usa email padrão
        if (user.roles?.includes('admin')) {
          updateFields.email = 'admin@mk-edge.com.br';
          console.log('   ✅ Será adicionado: admin@mk-edge.com.br');
          needsUpdate = true;
        } 
        // Para usuários portal, tenta extrair do recuperacao_senha ou deixa vazio
        else if (user.recuperacao_senha?.email_recovery) {
          updateFields.email = user.recuperacao_senha.email_recovery;
          console.log(`   ✅ Será adicionado do backup: ${updateFields.email}`);
          needsUpdate = true;
        } else {
          updateFields.email = `${user.login}@provedor.com.br`;
          console.log(`   ⚠️  Será criado email temporário: ${updateFields.email}`);
          console.log('   💡 ATENÇÃO: Atualizar manualmente para o email real!');
          needsUpdate = true;
        }
      } else {
        console.log(`   ✅ Email: ${user.email}`);
      }
      
      // Verifica e adiciona celular se não existir
      if (!user.celular) {
        console.log('   ⚠️  Celular não definido');
        
        // Tenta extrair do recuperacao_senha
        if (user.recuperacao_senha?.celular) {
          updateFields.celular = user.recuperacao_senha.celular;
          console.log(`   ✅ Será adicionado do backup: ${updateFields.celular}`);
          needsUpdate = true;
        } else {
          // Deixa sem celular mas adiciona um aviso
          console.log('   ❌ Nenhum celular encontrado - URGENTE: adicionar manualmente!');
        }
      } else {
        console.log(`   ✅ Celular: ${user.celular}`);
      }
      
      // Verifica telefone (opcional)
      if (!user.telefone) {
        console.log('   ⚠️  Telefone não definido (opcional)');
      } else {
        console.log(`   ✅ Telefone: ${user.telefone}`);
      }
      
      // Se precisa atualizar, adiciona à lista
      if (needsUpdate) {
        updates.push({
          filter: { _id: user._id },
          update: { $set: updateFields }
        });
        updatedCount++;
      }
    }
    
    // Aplica as atualizações
    if (updates.length > 0) {
      console.log('\n========================================');
      console.log('💾 APLICANDO ATUALIZAÇÕES...');
      console.log('========================================\n');
      
      for (const { filter, update } of updates) {
        const result = await usersCollection.updateOne(filter, update);
        if (result.modifiedCount > 0) {
          console.log(`✅ Atualizado: ${update.$set.email || 'usuário'}`);
        }
      }
    }
    
    // Verifica o resultado final
    console.log('\n========================================');
    console.log('📊 VERIFICAÇÃO FINAL');
    console.log('========================================\n');
    
    const updatedUsers = await usersCollection.find({}).toArray();
    let missingEmail = 0;
    let missingCelular = 0;
    
    for (const user of updatedUsers) {
      console.log(`\n👤 ${user.nome} (${user.login})`);
      console.log(`   Email: ${user.email || '❌ FALTANDO'}`);
      console.log(`   Celular: ${user.celular || '❌ FALTANDO'}`);
      console.log(`   Telefone: ${user.telefone || '⚠️  Não definido (opcional)'}`);
      
      if (!user.email) missingEmail++;
      if (!user.celular) missingCelular++;
    }
    
    console.log('\n========================================');
    console.log('📊 RESUMO');
    console.log('========================================\n');
    console.log(`Total de usuários: ${updatedUsers.length}`);
    console.log(`Usuários atualizados: ${updatedCount}`);
    console.log(`\nEstado final:`);
    console.log(`  ❌ Sem email: ${missingEmail}`);
    console.log(`  ❌ Sem celular: ${missingCelular}`);
    
    if (missingEmail > 0 || missingCelular > 0) {
      console.log('\n⚠️  ATENÇÃO: Existem usuários sem dados de contato completos!');
      console.log('   Execute o seguinte comando para adicionar manualmente:\n');
      console.log('   db.users.updateOne(');
      console.log('     { login: "LOGIN_DO_USUARIO" },');
      console.log('     { $set: { email: "email@provedor.com.br", celular: "99999999999" } }');
      console.log('   );\n');
    } else {
      console.log('\n✅ Todos os usuários têm dados de contato completos!');
    }
    
    console.log('\n✅ Migração concluída!');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error.message);
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
