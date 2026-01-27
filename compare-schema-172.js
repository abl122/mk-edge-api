#!/usr/bin/env node

/**
 * Script de Comparação de Schema - Servidor 172.31.255.4
 * 
 * Compara o schema local com o schema do servidor remoto
 * e identifica diferenças nos campos (especialmente email e celular)
 */

const mongoose = require('mongoose');

// Configurações
const LOCAL_MONGODB_URL = 'mongodb://localhost:27017/mkedgetenants';
const REMOTE_MONGODB_URL = 'mongodb://172.31.255.4:27017/mkedgetenants';

// Schema esperado completo baseado no User.js local
const EXPECTED_USER_FIELDS = {
  // Informações básicas
  nome: { type: 'string', required: true },
  email: { type: 'string', required: false },
  telefone: { type: 'string', required: false },
  celular: { type: 'string', required: false },
  
  // Login e Senha
  login: { type: 'string', required: true },
  senha: { type: 'string', required: true },
  
  // Tenant
  tenant_id: { type: 'ObjectId', required: false },
  
  // Roles e Permissões
  roles: { type: 'array', required: false },
  permissoes: { type: 'array', required: false },
  
  // Status
  ativo: { type: 'boolean', required: false },
  bloqueado: { type: 'boolean', required: false },
  motivo_bloqueio: { type: 'string', required: false },
  
  // Tentativas de login
  tentativas_login: { type: 'number', required: false },
  ultima_tentativa: { type: 'Date', required: false },
  ultimo_login: { type: 'Date', required: false },
  
  // Recuperação de senha
  recuperacao_senha: { type: 'object', required: false },
  
  // Metadados
  criado_em: { type: 'Date', required: false },
  atualizado_em: { type: 'Date', required: false },
  criado_por: { type: 'string', required: false },
  createdAt: { type: 'Date', required: false },
  updatedAt: { type: 'Date', required: false }
};

/**
 * Analisa os campos de um documento
 */
function analyzeDocument(doc) {
  const fields = {};
  
  for (const [key, value] of Object.entries(doc)) {
    if (key === '_id' || key === '__v') continue;
    
    if (value === null || value === undefined) {
      fields[key] = { type: 'null', hasValue: false };
    } else if (value instanceof Date) {
      fields[key] = { type: 'Date', hasValue: true };
    } else if (mongoose.Types.ObjectId.isValid(value) && typeof value === 'object') {
      fields[key] = { type: 'ObjectId', hasValue: true };
    } else if (Array.isArray(value)) {
      fields[key] = { type: 'array', hasValue: value.length > 0 };
    } else if (typeof value === 'object') {
      fields[key] = { type: 'object', hasValue: true };
    } else {
      fields[key] = { type: typeof value, hasValue: !!value };
    }
  }
  
  return fields;
}

/**
 * Compara campos entre local e remoto
 */
function compareUsers(localUsers, remoteUsers) {
  console.log('\n========================================');
  console.log('📊 COMPARAÇÃO DE SCHEMAS - Users');
  console.log('========================================\n');
  
  const report = {
    localCount: localUsers.length,
    remoteCount: remoteUsers.length,
    missingFields: {},
    fieldComparison: {}
  };
  
  // Cria mapa de usuários remotos por login
  const remoteMap = new Map();
  remoteUsers.forEach(user => {
    remoteMap.set(user.login, user);
  });
  
  console.log(`Local: ${localUsers.length} usuários`);
  console.log(`Remoto: ${remoteUsers.length} usuários\n`);
  
  // Analisa cada campo esperado
  console.log('🔍 Campos Críticos (email, telefone, celular):\n');
  
  for (const localUser of localUsers) {
    const remoteUser = remoteMap.get(localUser.login);
    
    if (!remoteUser) {
      console.log(`⚠️  ${localUser.login} - EXISTE NO LOCAL mas NÃO EXISTE NO REMOTO`);
      continue;
    }
    
    const issues = [];
    
    // Verifica campos críticos
    if (localUser.email && !remoteUser.email) {
      issues.push(`❌ email: "${localUser.email}" → FALTANDO`);
    }
    if (localUser.telefone && !remoteUser.telefone) {
      issues.push(`❌ telefone: "${localUser.telefone}" → FALTANDO`);
    }
    if (localUser.celular && !remoteUser.celular) {
      issues.push(`❌ celular: "${localUser.celular}" → FALTANDO`);
    }
    
    if (issues.length > 0) {
      console.log(`\n👤 ${localUser.nome} (${localUser.login})`);
      console.log('   ' + issues.join('\n   '));
      
      report.missingFields[localUser.login] = {
        nome: localUser.nome,
        issues: issues,
        localData: {
          email: localUser.email,
          telefone: localUser.telefone,
          celular: localUser.celular
        },
        remoteData: {
          email: remoteUser.email,
          telefone: remoteUser.telefone,
          celular: remoteUser.celular
        }
      };
    }
  }
  
  // Verifica usuários que existem no remoto mas não no local
  console.log('\n\n🔍 Usuários apenas no REMOTO:\n');
  let onlyRemoteCount = 0;
  for (const remoteUser of remoteUsers) {
    const localUser = localUsers.find(u => u.login === remoteUser.login);
    if (!localUser) {
      console.log(`⚠️  ${remoteUser.login} (${remoteUser.nome})`);
      onlyRemoteCount++;
    }
  }
  
  if (onlyRemoteCount === 0) {
    console.log('✅ Nenhum usuário exclusivo no remoto');
  }
  
  return report;
}

/**
 * Main
 */
async function main() {
  let localConn, remoteConn;
  
  try {
    console.log('\n🔌 Conectando ao MongoDB LOCAL...');
    localConn = await mongoose.createConnection(LOCAL_MONGODB_URL).asPromise();
    console.log('✅ Conectado ao LOCAL\n');
    
    console.log('🔌 Conectando ao MongoDB REMOTO (172.31.255.4)...');
    remoteConn = await mongoose.createConnection(REMOTE_MONGODB_URL).asPromise();
    console.log('✅ Conectado ao REMOTO\n');
    
    // Busca todos os usuários
    const localUsers = await localConn.db.collection('users').find({}).toArray();
    const remoteUsers = await remoteConn.db.collection('users').find({}).toArray();
    
    // Compara
    const report = compareUsers(localUsers, remoteUsers);
    
    // Resume
    console.log('\n\n========================================');
    console.log('📈 RESUMO');
    console.log('========================================\n');
    
    const issueCount = Object.keys(report.missingFields).length;
    
    if (issueCount === 0) {
      console.log('✅ Todos os campos críticos estão sincronizados!\n');
    } else {
      console.log(`⚠️  ${issueCount} usuários com campos faltantes no remoto\n`);
      console.log('💡 Para sincronizar, execute:\n');
      console.log('   node sync-to-remote-172.js\n');
    }
    
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
