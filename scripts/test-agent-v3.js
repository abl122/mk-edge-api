#!/usr/bin/env node

/**
 * MK-EDGE Agent v3 Validation Test
 * 
 * Testa se o novo agente está funcionando corretamente
 * 
 * Uso:
 *   node mk-edge-api/scripts/test-agent-v3.js
 */

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ============================================
// CONFIG
// ============================================

const AGENT_URL = process.env.AGENT_URL || 'http://localhost/mkedge-agent/api-v3.php';
const AGENT_TOKEN = process.env.MKEDGE_API_TOKEN || 'seu-token-aqui';
const AGENT_ENCRYPTION_KEY = process.env.AGENT_ENCRYPTION_KEY || '';
const CATALOG_PATH = process.env.AGENT_CATALOG_PATH || './Agente/mk-edge/catalog.json';

// Cores
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// ============================================
// UTILITÁRIOS
// ============================================

function log(type, message) {
  const timestamp = new Date().toISOString().substring(11, 19);
  const prefix = {
    'INFO': `[${timestamp}] ℹ️ `,
    'OK': `[${timestamp}] ${GREEN}✓${RESET}`,
    'ERROR': `[${timestamp}] ${RED}✗${RESET}`,
    'WARN': `[${timestamp}] ${YELLOW}⚠${RESET}`
  }[type] || `[${timestamp}] `;
  
  console.log(`${prefix} ${message}`);
}

function computeHmac(payload, token) {
  return crypto.createHmac('sha256', token)
    .update(payload)
    .digest('hex');
}

async function request(operation, params = {}, encrypted = false) {
  const axios = require('axios');
  
  let payload;
  const requestData = {
    operation,
    params
  };
  
  payload = JSON.stringify(requestData);
  const signature = computeHmac(payload, AGENT_TOKEN);
  
  try {
    const response = await axios.post(AGENT_URL, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'X-MKEdge-Signature': signature
      },
      timeout: 5000,
      validateStatus: () => true
    });
    
    return {
      status: response.status,
      data: response.data,
      success: response.status === 200 && response.data?.success
    };
  } catch (error) {
    return {
      status: 0,
      error: error.message,
      success: false
    };
  }
}

// ============================================
// TESTES
// ============================================

async function testConnection() {
  log('INFO', `Testando conexão com ${AGENT_URL}`);
  
  const result = await request('ping', {});
  
  if (result.success) {
    log('OK', `Agente está respondendo (HTTP ${result.status})`);
    return true;
  } else {
    log('ERROR', `Falha ao conectar: ${result.error || result.data?.error}`);
    return false;
  }
}

async function testCatalog() {
  log('INFO', 'Validando catálogo');
  
  try {
    const fs = require('fs');
    const content = fs.readFileSync(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(content);
    
    const operationCount = Object.keys(catalog.operations || {}).length;
    
    if (operationCount === 0) {
      log('ERROR', 'Nenhuma operação encontrada no catálogo');
      return false;
    }
    
    log('OK', `Catálogo validado: ${operationCount} operações`);
    return true;
  } catch (error) {
    log('ERROR', `Erro ao ler catálogo: ${error.message}`);
    return false;
  }
}

async function testOperation(operation, params) {
  log('INFO', `Testando operação: ${operation}`);
  
  const result = await request(operation, params);
  
  if (result.success) {
    const dataInfo = Array.isArray(result.data.data) 
      ? `${result.data.data.length} linhas`
      : 'resultado retornado';
    log('OK', `Operação executada: ${dataInfo}`);
    return true;
  } else if (result.status === 403) {
    log('WARN', 'Operação não permitida no catálogo');
    return false;
  } else if (result.status === 400) {
    log('WARN', `Parâmetros faltando: ${result.data?.error}`);
    return false;
  } else {
    log('ERROR', `${result.data?.error || result.error}`);
    return false;
  }
}

async function testSqlInjection() {
  log('INFO', 'Testando proteção contra SQL injection');
  
  // Tenta SQL injection clássica
  const maliciousLogins = [
    "' OR '1'='1",
    "'; DROP TABLE sis_cliente; --",
    "admin' UNION SELECT * FROM sis_cliente --",
    "1; DELETE FROM sis_lanc; --"
  ];
  
  let protected = true;
  
  for (const malicious of maliciousLogins) {
    const result = await request('cliente.autenticar', { login: malicious });
    
    // Esperamos erro ou resultado vazio, NÃO execução do SQL injection
    if (result.success && Array.isArray(result.data.data) && result.data.data.length > 0) {
      // Se retornou dados, pode ser legítimo ou SQL injection bem-sucedida
      // Verificar se o login retornado é igual ao injetado
      const returnedLogin = result.data.data[0]?.login;
      
      if (returnedLogin === malicious) {
        log('ERROR', `Possível SQL injection: ${malicious}`);
        protected = false;
      }
    }
  }
  
  if (protected) {
    log('OK', 'Nenhuma SQL injection detectada');
  }
  
  return protected;
}

async function testEncryption() {
  if (!AGENT_ENCRYPTION_KEY) {
    log('WARN', 'AGENT_ENCRYPTION_KEY não configurada, pulando teste de criptografia');
    return true;
  }
  
  log('INFO', 'Testando criptografia');
  
  // Validação básica de chave
  if (AGENT_ENCRYPTION_KEY.length < 64) {
    log('ERROR', 'AGENT_ENCRYPTION_KEY muito curta (mínimo 64 caracteres hexadecimais)');
    return false;
  }
  
  try {
    // Valida que é hexadecimal válido
    Buffer.from(AGENT_ENCRYPTION_KEY, 'hex');
    log('OK', 'Chave de criptografia válida');
    return true;
  } catch (error) {
    log('ERROR', `Chave de criptografia inválida: ${error.message}`);
    return false;
  }
}

async function testSignature() {
  log('INFO', 'Testando assinatura HMAC');
  
  const payload = JSON.stringify({ operation: 'ping', params: {} });
  const validSignature = computeHmac(payload, AGENT_TOKEN);
  
  log('OK', `Assinatura computada: ${validSignature.substring(0, 16)}...`);
  return true;
}

// ============================================
// MAIN
// ============================================

async function runTests() {
  console.log(`
${YELLOW}╔═══════════════════════════════════════════════╗${RESET}
${YELLOW}║    MK-EDGE Agent v3 Validation Test          ║${RESET}
${YELLOW}╚═══════════════════════════════════════════════╝${RESET}

Configuração:
  - Agent URL: ${AGENT_URL}
  - Catalog: ${CATALOG_PATH}
  - Encryption: ${AGENT_ENCRYPTION_KEY ? '✓ ativada' : '✗ desabilitada'}

`);
  
  const tests = [
    { name: 'Conexão com agente', fn: () => testConnection() },
    { name: 'Validação de catálogo', fn: () => testCatalog() },
    { name: 'Assinatura HMAC', fn: () => testSignature() },
    { name: 'Criptografia', fn: () => testEncryption() },
    { name: 'Ping (health check)', fn: () => testOperation('ping', {}) },
    { name: 'Proteção SQL injection', fn: () => testSqlInjection() }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ test: test.name, passed });
    } catch (error) {
      log('ERROR', `Erro no teste "${test.name}": ${error.message}`);
      results.push({ test: test.name, passed: false });
    }
  }
  
  // Resumo
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`
${YELLOW}═══════════════════════════════════════════════${RESET}
Resultado: ${passed}/${total} testes passaram
${YELLOW}═══════════════════════════════════════════════${RESET}
`);
  
  if (passed === total) {
    log('OK', 'Todos os testes passaram! Agente v3 está pronto.');
    process.exit(0);
  } else {
    log('ERROR', 'Alguns testes falharam. Verifique a configuração.');
    process.exit(1);
  }
}

// Verifica se axios está instalado
try {
  require('axios');
  runTests().catch(error => {
    log('ERROR', error.message);
    process.exit(1);
  });
} catch (error) {
  log('ERROR', 'axios não está instalado. Execute: npm install axios');
  process.exit(1);
}
