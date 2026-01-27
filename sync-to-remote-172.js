#!/usr/bin/env node

/**
 * Script de Sincronização - Servidor 172.31.255.4
 * 
 * Sincroniza campos faltantes (email, telefone, celular) do local para o remoto
 * ATENÇÃO: Este script MODIFICA dados no servidor remoto!
 */

const mongoose = require('mongoose');
const readline = require('readline');

// Configurações
const LOCAL_MONGODB_URL = 'mongodb://localhost:27017/mkedgetenants';
const REMOTE_MONGODB_URL = 'mongodb://172.31.255.4:27017/mkedgetenants';

/**
 * Pergunta de confirmação
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 's' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Sincroniza usuários
 */
async function syncUsers(localConn, remoteConn, dryRun = true) {
  const localUsers = await localConn.db.collection('users').find({}).toArray();
  const remoteUsers = await remoteConn.db.collection('users').find({}).toArray();
  
  const remoteMap = new Map();
  remoteUsers.forEach(user => {
    remoteMap.set(user.login, user);
  });
  
  const updates = [];
  
  console.log('\n========================================');
  console.log('🔄 ANÁLISE DE SINCRONIZAÇÃO');
  console.log('========================================\n');
  
  for (const localUser of localUsers) {
    const remoteUser = remoteMap.get(localUser.login);
    
    if (!remoteUser) {
      console.log(`⚠️  ${localUser.login} - não existe no remoto (será ignorado)`);
      continue;
    }
    
    const updateFields = {};
    let hasUpdates = false;
    
    // Campos críticos a sincronizar
    const criticalFields = ['email', 'telefone', 'celular', 'nome'];
    
    for (const field of criticalFields) {
      if (localUser[field] && !remoteUser[field]) {
        updateFields[field] = localUser[field];
        hasUpdates = true;
      }
    }
    
    // Campos opcionais importantes
    if (localUser.ativo !== undefined && remoteUser.ativo === undefined) {
      updateFields.ativo = localUser.ativo;
      hasUpdates = true;
    }
    
    if (localUser.bloqueado !== undefined && remoteUser.bloqueado === undefined) {
      updateFields.bloqueado = localUser.bloqueado;
      hasUpdates = true;
    }
    
    if (localUser.roles && localUser.roles.length > 0 && (!remoteUser.roles || remoteUser.roles.length === 0)) {
      updateFields.roles = localUser.roles;
      hasUpdates = true;
    }
    
    if (hasUpdates) {
      updates.push({
        login: localUser.login,
        nome: localUser.nome,
        _id: remoteUser._id,
        updates: updateFields
      });
      
      console.log(`\n👤 ${localUser.nome} (${localUser.login})`);
      console.log('   Atualizações:');
      for (const [key, value] of Object.entries(updateFields)) {
        console.log(`   ✏️  ${key}: "${value}"`);
      }
    }
  }
  
  console.log('\n\n========================================');
  console.log('📊 RESUMO');
  console.log('========================================\n');
  console.log(`Total de usuários locais: ${localUsers.length}`);
  console.log(`Total de usuários remotos: ${remoteUsers.length}`);
  console.log(`Usuários a atualizar: ${updates.length}\n`);
  
  if (updates.length === 0) {
    console.log('✅ Nenhuma atualização necessária!\n');
    return { updated: 0, errors: 0 };
  }
  
  if (dryRun) {
    console.log('🔍 DRY RUN - Nenhuma alteração foi feita\n');
    console.log('💡 Para aplicar as mudanças, execute:\n');
    console.log('   node sync-to-remote-172.js --apply\n');
    return { updated: 0, errors: 0 };
  }
  
  // Aplicar atualizações
  console.log('\n⚠️  APLICANDO ATUALIZAÇÕES NO SERVIDOR REMOTO...\n');
  
  let updated = 0;
  let errors = 0;
  
  for (const update of updates) {
    try {
      const result = await remoteConn.db.collection('users').updateOne(
        { _id: update._id },
        { 
          $set: {
            ...update.updates,
            atualizado_em: new Date()
          }
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`✅ ${update.login} - atualizado`);
        updated++;
      } else {
        console.log(`⚠️  ${update.login} - sem modificações`);
      }
    } catch (error) {
      console.error(`❌ ${update.login} - erro: ${error.message}`);
      errors++;
    }
  }
  
  console.log('\n========================================');
  console.log('✅ SINCRONIZAÇÃO CONCLUÍDA');
  console.log('========================================\n');
  console.log(`Atualizados: ${updated}`);
  console.log(`Erros: ${errors}\n`);
  
  return { updated, errors };
}

/**
 * Main
 */
async function main() {
  let localConn, remoteConn;
  
  const args = process.argv.slice(2);
  const applyChanges = args.includes('--apply');
  
  try {
    console.log('\n========================================');
    console.log('🔄 SINCRONIZAÇÃO DE SCHEMA');
    console.log('Servidor: 172.31.255.4');
    console.log(`Modo: ${applyChanges ? '⚠️  APLICAR MUDANÇAS' : '🔍 DRY RUN'}`);
    console.log('========================================\n');
    
    if (applyChanges) {
      console.log('⚠️  ATENÇÃO: Este script irá MODIFICAR dados no servidor remoto!\n');
      const confirmed = await askConfirmation('Deseja continuar? (s/N): ');
      
      if (!confirmed) {
        console.log('\n❌ Operação cancelada pelo usuário\n');
        process.exit(0);
      }
    }
    
    console.log('\n🔌 Conectando ao MongoDB LOCAL...');
    localConn = await mongoose.createConnection(LOCAL_MONGODB_URL).asPromise();
    console.log('✅ Conectado ao LOCAL');
    
    console.log('\n🔌 Conectando ao MongoDB REMOTO (172.31.255.4)...');
    remoteConn = await mongoose.createConnection(REMOTE_MONGODB_URL).asPromise();
    console.log('✅ Conectado ao REMOTO');
    
    // Sincroniza
    await syncUsers(localConn, remoteConn, !applyChanges);
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (localConn) await localConn.close();
    if (remoteConn) await remoteConn.close();
    process.exit(0);
  }
}

main();
