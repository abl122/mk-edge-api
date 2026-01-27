#!/usr/bin/env node

/**
 * Testa login e verifica se os dados de contato estão sendo retornados
 */

const mongoose = require('mongoose');
const AuthService = require('./src/app/services/AuthService');
require('./src/app/schemas/User');
require('./src/app/schemas/Tenant');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function testAdminLogin() {
  console.log('\n🔐 Testando Login ADMIN...\n');
  
  try {
    const result = await AuthService.login('admin', 'admin', null);
    
    console.log('✅ Login bem-sucedido!');
    console.log('\n📋 Dados retornados do usuário:');
    console.log('-----------------------------------');
    console.log(`Nome: ${result.user.nome}`);
    console.log(`Login: ${result.user.login}`);
    console.log(`Email: ${result.user.email || '❌ NÃO DEFINIDO'}`);
    console.log(`Telefone: ${result.user.telefone || '⚠️  NÃO DEFINIDO'}`);
    console.log(`Celular: ${result.user.celular || '❌ NÃO DEFINIDO'}`);
    console.log(`Roles: ${result.user.roles?.join(', ')}`);
    console.log(`Tenant ID: ${result.user.tenant_id || 'NULL (admin)'}`);
    
    console.log('\n✅ Campos de contato disponíveis para recuperação de senha:');
    if (result.user.email) {
      console.log('   ✅ Email: Pode recuperar por email');
    } else {
      console.log('   ❌ Email: NÃO PODE recuperar por email');
    }
    
    if (result.user.celular) {
      console.log('   ✅ Celular: Pode recuperar por SMS/WhatsApp');
    } else {
      console.log('   ❌ Celular: NÃO PODE recuperar por SMS/WhatsApp');
    }
    
    if (result.user.telefone) {
      console.log('   ✅ Telefone: Disponível como alternativa');
    } else {
      console.log('   ⚠️  Telefone: Não definido (opcional)');
    }
    
  } catch (error) {
    console.error('❌ Erro no login:', error.message);
  }
}

async function testPortalLogin() {
  console.log('\n🔐 Testando Login PORTAL...\n');
  
  try {
    // Busca o tenant_id do usuário portal
    const User = mongoose.model('User');
    const portalUser = await User.findOne({ roles: 'portal' });
    
    if (!portalUser) {
      console.log('⚠️  Nenhum usuário portal encontrado para teste');
      return;
    }
    
    const result = await AuthService.login(portalUser.login, 'senha123', portalUser.tenant_id.toString());
    
    console.log('✅ Login bem-sucedido!');
    console.log('\n📋 Dados retornados do usuário:');
    console.log('-----------------------------------');
    console.log(`Nome: ${result.user.nome}`);
    console.log(`Login: ${result.user.login}`);
    console.log(`Email: ${result.user.email || '❌ NÃO DEFINIDO'}`);
    console.log(`Telefone: ${result.user.telefone || '⚠️  NÃO DEFINIDO'}`);
    console.log(`Celular: ${result.user.celular || '❌ NÃO DEFINIDO'}`);
    console.log(`Roles: ${result.user.roles?.join(', ')}`);
    console.log(`Tenant ID: ${result.user.tenant_id}`);
    
    if (result.tenant) {
      console.log(`\n🏢 Tenant: ${result.tenant.nome || 'N/A'}`);
    }
    
    console.log('\n✅ Campos de contato disponíveis para recuperação de senha:');
    if (result.user.email) {
      console.log('   ✅ Email: Pode recuperar por email');
    } else {
      console.log('   ❌ Email: NÃO PODE recuperar por email');
    }
    
    if (result.user.celular) {
      console.log('   ✅ Celular: Pode recuperar por SMS/WhatsApp');
    } else {
      console.log('   ❌ Celular: NÃO PODE recuperar por SMS/WhatsApp');
    }
    
    if (result.user.telefone) {
      console.log('   ✅ Telefone: Disponível como alternativa');
    } else {
      console.log('   ⚠️  Telefone: Não definido (opcional)');
    }
    
  } catch (error) {
    console.error('❌ Erro no login:', error.message);
  }
}

async function main() {
  try {
    console.log('========================================');
    console.log('🧪 TESTE DE LOGIN E DADOS DE CONTATO');
    console.log('========================================');
    
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB');
    
    await testAdminLogin();
    await testPortalLogin();
    
    console.log('\n========================================');
    console.log('✅ Testes concluídos!');
    console.log('========================================\n');
    
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
