#!/usr/bin/env node

/**
 * Script para verificar usuários no MongoDB Remoto
 * Execute: node check-remote-users.js
 */

const mongoose = require('mongoose');

// URL do MongoDB remoto (ajuste conforme necessário)
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://mk-edge-mongo:27017/mkedgetenants';

async function main() {
  try {
    console.log('\n========================================');
    console.log('🔍 VERIFICANDO USUÁRIOS - MongoDB Remoto');
    console.log('========================================\n');
    
    console.log(`📡 Conectando a: ${MONGODB_URL}`);
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Busca todos os usuários
    const users = await usersCollection.find({}).toArray();
    console.log(`📊 Total de usuários: ${users.length}\n`);
    
    if (users.length === 0) {
      console.log('⚠️  Nenhum usuário encontrado no banco!\n');
      return;
    }
    
    // Lista cada usuário com seus dados
    users.forEach((user, index) => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`👤 USUÁRIO ${index + 1}/${users.length}`);
      console.log('='.repeat(60));
      
      console.log(`_id: ${user._id}`);
      console.log(`nome: ${user.nome || '❌ FALTANDO'}`);
      console.log(`email: ${user.email || '❌ FALTANDO'}`);
      console.log(`login: ${user.login || '❌ FALTANDO'}`);
      console.log(`senha: ${user.senha ? user.senha.substring(0, 20) + '...' : '❌ FALTANDO'}`);
      console.log(`celular: ${user.celular || '❌ FALTANDO'}`);
      console.log(`telefone: ${user.telefone || '(não definido)'}`);
      console.log(`tenant_id: ${user.tenant_id || '(não definido)'}`);
      console.log(`roles: ${user.roles ? JSON.stringify(user.roles) : '❌ FALTANDO'}`);
      console.log(`permissoes: ${user.permissoes ? JSON.stringify(user.permissoes) : '❌ FALTANDO'}`);
      console.log(`ativo: ${user.ativo !== undefined ? user.ativo : '❌ FALTANDO'}`);
      console.log(`bloqueado: ${user.bloqueado !== undefined ? user.bloqueado : '❌ FALTANDO'}`);
      console.log(`tentativas_login: ${user.tentativas_login !== undefined ? user.tentativas_login : '❌ FALTANDO'}`);
      console.log(`ultimo_login: ${user.ultimo_login || '(não definido)'}`);
      console.log(`criado_em: ${user.criado_em || '❌ FALTANDO'}`);
      console.log(`atualizado_em: ${user.atualizado_em || '❌ FALTANDO'}`);
      console.log(`createdAt: ${user.createdAt || '(não definido)'}`);
      console.log(`updatedAt: ${user.updatedAt || '(não definido)'}`);
      
      if (user.recuperacao_senha) {
        console.log(`\nrecuperacao_senha:`);
        console.log(`  celular: ${user.recuperacao_senha.celular || '(não definido)'}`);
        console.log(`  codigo: ${user.recuperacao_senha.codigo || '(não definido)'}`);
        console.log(`  expira_em: ${user.recuperacao_senha.expira_em || '(não definido)'}`);
        console.log(`  metodo: ${user.recuperacao_senha.metodo || '(não definido)'}`);
        console.log(`  email_recovery: ${user.recuperacao_senha.email_recovery || '(não definido)'}`);
      } else {
        console.log(`\nrecuperacao_senha: ❌ FALTANDO`);
      }
      
      // Verifica campos críticos faltantes
      const missing = [];
      if (!user.nome) missing.push('nome');
      if (!user.email) missing.push('email');
      if (!user.login) missing.push('login');
      if (!user.senha) missing.push('senha');
      if (!user.celular) missing.push('celular');
      if (!user.roles || user.roles.length === 0) missing.push('roles');
      if (!user.permissoes || user.permissoes.length === 0) missing.push('permissoes');
      
      if (missing.length > 0) {
        console.log(`\n⚠️  CAMPOS CRÍTICOS FALTANDO: ${missing.join(', ')}`);
      }
    });
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📋 RESUMO');
    console.log('='.repeat(60));
    
    const admins = users.filter(u => u.roles?.includes('admin'));
    const portals = users.filter(u => u.roles?.includes('portal'));
    const withEmail = users.filter(u => u.email);
    const withCelular = users.filter(u => u.celular);
    const incomplete = users.filter(u => !u.email || !u.celular || !u.nome || !u.login);
    
    console.log(`Total de usuários: ${users.length}`);
    console.log(`- Admin: ${admins.length}`);
    console.log(`- Portal: ${portals.length}`);
    console.log(`- Com email: ${withEmail.length}`);
    console.log(`- Com celular: ${withCelular.length}`);
    console.log(`- Incompletos: ${incomplete.length}`);
    
    if (incomplete.length > 0) {
      console.log(`\n⚠️  Usuários incompletos:`);
      incomplete.forEach(u => {
        const missing = [];
        if (!u.nome) missing.push('nome');
        if (!u.email) missing.push('email');
        if (!u.login) missing.push('login');
        if (!u.celular) missing.push('celular');
        console.log(`   - ${u.login || u._id}: falta ${missing.join(', ')}`);
      });
    }
    
    await mongoose.connection.close();
    console.log('\n✅ Conexão encerrada\n');
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
