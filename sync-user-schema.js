#!/usr/bin/env node

/**
 * Script de Sincronização de Schema - MongoDB Remoto
 * 
 * Compara o schema atual com o esperado e adiciona campos/dados faltantes
 * Execute no servidor: node sync-user-schema.js
 */

const mongoose = require('mongoose');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://mk-edge-mongo:27017/mkedgetenants';

// Schema esperado (baseado no local)
const EXPECTED_FIELDS = {
  nome: 'string',
  email: 'string',
  telefone: 'string',
  celular: 'string',
  login: 'string',
  senha: 'string',
  tenant_id: 'ObjectId',
  roles: 'array',
  permissoes: 'array',
  ativo: 'boolean',
  bloqueado: 'boolean',
  motivo_bloqueio: 'string',
  tentativas_login: 'number',
  ultima_tentativa: 'Date',
  ultimo_login: 'Date',
  recuperacao_senha: 'object',
  criado_em: 'Date',
  atualizado_em: 'Date',
  criado_por: 'string',
  createdAt: 'Date',
  updatedAt: 'Date'
};

async function main() {
  try {
    console.log('\n========================================');
    console.log('🔄 SINCRONIZAÇÃO DE SCHEMA - Usuários');
    console.log('========================================\n');
    
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Busca todos os usuários
    const users = await usersCollection.find({}).toArray();
    console.log(`📊 Encontrados ${users.length} usuários\n`);
    
    // Analisa campos faltantes
    const missingFieldsReport = {};
    const updates = [];
    
    for (const user of users) {
      console.log(`\n👤 ${user.nome} (${user.login})`);
      console.log('-----------------------------------');
      
      const userUpdates = {};
      let hasUpdates = false;
      
      // Verifica email
      if (!user.email) {
        if (user.recuperacao_senha?.email_recovery) {
          userUpdates.email = user.recuperacao_senha.email_recovery;
          console.log(`   📧 Email: FALTANDO → ${userUpdates.email} (de recuperacao_senha)`);
          hasUpdates = true;
        } else if (user.roles?.includes('admin')) {
          userUpdates.email = 'admin@mk-edge.com.br';
          console.log(`   📧 Email: FALTANDO → ${userUpdates.email} (padrão admin)`);
          hasUpdates = true;
        } else {
          console.log(`   ❌ Email: FALTANDO (sem dados para recuperar)`);
          missingFieldsReport[user.login] = missingFieldsReport[user.login] || [];
          missingFieldsReport[user.login].push('email');
        }
      } else {
        console.log(`   ✅ Email: ${user.email}`);
      }
      
      // Verifica telefone
      if (!user.telefone) {
        console.log('   ⚠️  Telefone: FALTANDO (opcional)');
      } else {
        console.log(`   ✅ Telefone: ${user.telefone}`);
      }
      
      // Verifica celular
      if (!user.celular) {
        if (user.recuperacao_senha?.celular) {
          userUpdates.celular = user.recuperacao_senha.celular;
          console.log(`   📱 Celular: FALTANDO → ${userUpdates.celular} (de recuperacao_senha)`);
          hasUpdates = true;
        } else {
          console.log(`   ❌ Celular: FALTANDO (sem dados para recuperar)`);
          missingFieldsReport[user.login] = missingFieldsReport[user.login] || [];
          missingFieldsReport[user.login].push('celular');
        }
      } else {
        console.log(`   ✅ Celular: ${user.celular}`);
      }
      
      // Verifica tenant_id (admin não deve ter)
      if (user.roles?.includes('admin') && user.tenant_id) {
        userUpdates.$unset = { tenant_id: "" };
        console.log(`   🔧 Tenant ID: Será REMOVIDO (admin não deve ter tenant)`);
        hasUpdates = true;
      } else if (user.roles?.includes('portal') && !user.tenant_id) {
        console.log(`   ❌ Tenant ID: FALTANDO (portal precisa ter tenant)`);
        missingFieldsReport[user.login] = missingFieldsReport[user.login] || [];
        missingFieldsReport[user.login].push('tenant_id');
      }
      
      // Verifica campos opcionais
      ['motivo_bloqueio', 'ultima_tentativa', 'criado_por'].forEach(field => {
        if (!user[field]) {
          console.log(`   ⚠️  ${field}: não definido (opcional)`);
        }
      });
      
      // Adiciona à lista de updates
      if (hasUpdates) {
        updates.push({
          filter: { _id: user._id },
          update: userUpdates.$unset ? 
            { $set: userUpdates, $unset: userUpdates.$unset } : 
            { $set: userUpdates },
          user: user.nome
        });
      }
    }
    
    // Aplica as atualizações
    if (updates.length > 0) {
      console.log('\n========================================');
      console.log('💾 APLICANDO ATUALIZAÇÕES...');
      console.log('========================================\n');
      
      for (const { filter, update, user } of updates) {
        const result = await usersCollection.updateOne(filter, update);
        if (result.modifiedCount > 0) {
          console.log(`✅ ${user}: atualizado`);
        }
      }
    } else {
      console.log('\n✅ Nenhuma atualização necessária - todos os dados estão completos!');
    }
    
    // Relatório de campos que precisam ser adicionados manualmente
    if (Object.keys(missingFieldsReport).length > 0) {
      console.log('\n========================================');
      console.log('⚠️  ATENÇÃO: Dados Faltantes');
      console.log('========================================\n');
      
      for (const [login, fields] of Object.entries(missingFieldsReport)) {
        console.log(`❌ ${login}: faltam → ${fields.join(', ')}`);
        console.log(`   Comando para atualizar:`);
        
        const updateCmd = {};
        if (fields.includes('email')) updateCmd.email = 'email@provedor.com.br';
        if (fields.includes('celular')) updateCmd.celular = '99999999999';
        
        console.log(`   db.users.updateOne(`);
        console.log(`     { login: "${login}" },`);
        console.log(`     { $set: ${JSON.stringify(updateCmd, null, 2).replace(/\n/g, '\n     ')} }`);
        console.log(`   );\n`);
      }
    }
    
    // Verificação final
    console.log('\n========================================');
    console.log('📋 VERIFICAÇÃO FINAL');
    console.log('========================================\n');
    
    const finalUsers = await usersCollection.find({}).toArray();
    let complete = 0;
    let incomplete = 0;
    
    for (const user of finalUsers) {
      const hasEmail = !!user.email;
      const hasCelular = !!user.celular;
      const tenantOk = user.roles?.includes('admin') ? !user.tenant_id : !!user.tenant_id;
      
      const isComplete = hasEmail && hasCelular && tenantOk;
      
      if (isComplete) {
        complete++;
        console.log(`✅ ${user.nome} (${user.login})`);
      } else {
        incomplete++;
        console.log(`❌ ${user.nome} (${user.login})`);
        if (!hasEmail) console.log(`   - Falta: email`);
        if (!hasCelular) console.log(`   - Falta: celular`);
        if (!tenantOk && user.roles?.includes('portal')) console.log(`   - Falta: tenant_id`);
        if (!tenantOk && user.roles?.includes('admin')) console.log(`   - Sobra: tenant_id (deve ser removido)`);
      }
    }
    
    console.log('\n========================================');
    console.log('📊 RESUMO FINAL');
    console.log('========================================\n');
    console.log(`Total de usuários: ${finalUsers.length}`);
    console.log(`✅ Completos: ${complete}`);
    console.log(`❌ Incompletos: ${incomplete}`);
    console.log(`📝 Atualizados nesta execução: ${updates.length}`);
    
    if (incomplete === 0) {
      console.log('\n🎉 Todos os usuários estão com dados completos!\n');
    } else {
      console.log('\n⚠️  Execute os comandos acima para completar os dados faltantes\n');
    }
    
    console.log('✅ Sincronização concluída!\n');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
