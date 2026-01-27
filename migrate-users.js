#!/usr/bin/env node

/**
 * Script para migrar usuários existentes para o novo modelo:
 * - Admin global (sem tenant_id)
 * - Usuários portal (com tenant_id e role "portal")
 */

const mongoose = require('mongoose');
require('./src/app/schemas/User'); // Carrega o schema atualizado
const logger = require('./src/logger');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function main() {
  try {
    console.log('🔄 Migrando usuários para o novo modelo...\n');
    
    // Conecta ao MongoDB
    console.log('📡 Conectando ao MongoDB...');
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');
    
    const User = mongoose.model('User');
    const users = await User.find({});
    
    console.log(`📊 Encontrados ${users.length} usuários para migrar\n`);
    
    let adminCount = 0;
    let portalCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        let updated = false;
        const oldData = {
          login: user.login,
          roles: [...user.roles],
          tenant_id: user.tenant_id
        };
        
        // Se tem role 'admin', remove tenant_id
        if (user.roles.includes('admin')) {
          if (user.tenant_id) {
            console.log(`🔧 Admin com tenant_id: ${user.login}`);
            user.tenant_id = undefined;
            updated = true;
          }
          adminCount++;
        } 
        // Se tem tenant_id mas não tem role 'portal', adiciona
        else if (user.tenant_id && !user.roles.includes('portal')) {
          console.log(`🔧 Adicionando role 'portal': ${user.login}`);
          
          // Remove roles antigas e adiciona portal
          user.roles = ['portal'];
          updated = true;
          portalCount++;
        }
        // Se tem tenant_id e já tem role portal
        else if (user.tenant_id && user.roles.includes('portal')) {
          console.log(`✅ Usuário portal já configurado: ${user.login}`);
          portalCount++;
        }
        
        // Salva se houve alterações
        if (updated) {
          // Desabilita validação de senha para não fazer rehash
          await user.save({ validateBeforeSave: false });
          console.log(`   ✅ Atualizado: ${oldData.login}`);
          console.log(`      - Roles: ${oldData.roles.join(', ')} → ${user.roles.join(', ')}`);
          console.log(`      - Tenant: ${oldData.tenant_id || 'null'} → ${user.tenant_id || 'null'}\n`);
        }
        
      } catch (error) {
        console.error(`❌ Erro ao migrar usuário ${user.login}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n========================================');
    console.log('📊 RESUMO DA MIGRAÇÃO');
    console.log('========================================\n');
    console.log(`Total de usuários: ${users.length}`);
    console.log(`✅ Admins (sem tenant): ${adminCount}`);
    console.log(`✅ Usuários portal (com tenant): ${portalCount}`);
    if (errorCount > 0) {
      console.log(`❌ Erros: ${errorCount}`);
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
