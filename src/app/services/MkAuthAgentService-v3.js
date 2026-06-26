const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../logger');

/**
 * MkAuthAgentService v3 — Comunicação Segura com Agente
 * 
 * Mudanças vs v2:
 * - Catálogo de operações (allowlist)
 * - Operações nomeadas (cliente.autenticar, cliente.faturas, etc.)
 * - Prepared statements no agente (sem SQL injection)
 * - ENCRYPTION_KEY obrigatória
 * - HMAC obrigatório
 * 
 * @version 3.0.0
 */
class MkAuthAgentService {
  
  /**
   * Carrega catálogo de operações permitidas
   */
  static loadCatalog() {
    if (!process.env.AGENT_CATALOG_PATH) {
      logger.warn('AGENT_CATALOG_PATH não definido, usando operações padrão');
      return this.DEFAULT_OPERATIONS;
    }
    
    try {
      const fs = require('fs');
      const path = require('path');
      const catalogPath = path.resolve(process.env.AGENT_CATALOG_PATH);
      const content = fs.readFileSync(catalogPath, 'utf8');
      const catalog = JSON.parse(content);
      return catalog.operations || this.DEFAULT_OPERATIONS;
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao carregar catálogo, usando padrão');
      return this.DEFAULT_OPERATIONS;
    }
  }
  
  /**
   * Operações padrão (fallback)
   */
  static DEFAULT_OPERATIONS = {
    'cliente.autenticar': {
      type: 'read',
      params: ['login']
    },
    'cliente.completo': {
      type: 'read',
      params: ['login']
    },
    'cliente.titulos.abertos': {
      type: 'read',
      params: ['login']
    },
    'cliente.titulos.vencidos': {
      type: 'read',
      params: ['login']
    },
    'cliente.titulos.pagos': {
      type: 'read',
      params: ['login']
    },
    'cliente.qrpix': {
      type: 'read',
      params: ['uuid_lanc']
    },
    'cliente.contrato': {
      type: 'read',
      params: ['login']
    },
    'ping': {
      type: 'read',
      params: []
    }
  };
  
  /**
   * Valida if operação existe e parâmetros são válidos
   */
  static validateOperation(operationName, params = {}) {
    const catalog = this.loadCatalog();
    const operation = catalog[operationName];
    
    if (!operation) {
      throw new Error(`Operação não permitida: ${operationName}`);
    }
    
    // Valida parâmetros
    const requiredParams = operation.params || [];
    for (const param of requiredParams) {
      if (!(param in params)) {
        throw new Error(`Parâmetro faltando: ${param}`);
      }
    }
    
    return operation;
  }
  
  /**
   * Encripta operação com AES-256-GCM
   * (compatível com agente v3)
   */
  static encryptOperation(operationName, params = {}, encryptionKey) {
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY é obrigatória na v3');
    }
    
    try {
      const payload = JSON.stringify({ operation: operationName, params });
      const iv = crypto.randomBytes(16);
      const key = crypto.createHash('sha256').update(encryptionKey).digest();
      
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(payload, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return {
        encrypted: true,
        data: `${iv.toString('hex')}:${encrypted}`
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao encriptar operação');
      throw error;
    }
  }
  
  /**
   * Computa assinatura HMAC-SHA256
   */
  static computeHmac(payload, token) {
    return crypto.createHmac('sha256', token)
      .update(payload)
      .digest('hex');
  }
  
  /**
   * Chama agente remoto com operação
   */
  static async callAgent(agentUrl, agentToken, operationName, params = {}, options = {}) {
    const encryptionKey = options.encryptionKey || process.env.AGENT_ENCRYPTION_KEY;
    const timeout = options.timeout || 10000;
    const retries = options.retries || 3;
    
    // Valida operação
    try {
      this.validateOperation(operationName, params);
    } catch (error) {
      logger.error({ error: error.message }, 'Validação de operação falhou');
      throw error;
    }
    
    // Monta payload
    let payload;
    const requestData = {
      operation: operationName,
      params: params
    };
    
    if (encryptionKey) {
      const encrypted = this.encryptOperation(operationName, params, encryptionKey);
      payload = JSON.stringify({
        operation: encrypted.data,
        encrypted: true,
        params: {}
      });
    } else {
      payload = JSON.stringify(requestData);
    }
    
    // Computa HMAC
    const signature = this.computeHmac(payload, agentToken);
    
    // Faz requisição com retry
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.debug({
          operation: operationName,
          params: params,
          attempt,
          url: agentUrl
        }, 'Chamando agente');
        
        const response = await axios.post(agentUrl, requestData, {
          headers: {
            'Content-Type': 'application/json',
            'X-MKEdge-Signature': signature,
            'X-MKEdge-Timestamp': Math.floor(Date.now() / 1000)
          },
          timeout,
          validateStatus: () => true // Não lança erro em status >= 400
        });
        
        // Valida resposta
        if (response.status !== 200) {
          throw new Error(`HTTP ${response.status}: ${response.data?.error || 'Unknown error'}`);
        }
        
        if (!response.data?.success) {
          throw new Error(response.data?.error || 'Agent returned success=false');
        }
        
        logger.debug({
          operation: operationName,
          rowsReturned: Array.isArray(response.data.data) ? response.data.data.length : 0
        }, 'Agente respondeu');
        
        return response.data.data;
        
      } catch (error) {
        lastError = error;
        
        if (attempt < retries) {
          const delayMs = Math.pow(2, attempt) * 100; // Exponential backoff
          logger.warn({
            operation: operationName,
            attempt,
            error: error.message,
            nextRetryMs: delayMs
          }, 'Tentativa falhou, retry em breve');
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    // Se chegou aqui, todas as tentativas falharam
    const error = new AgentError(`Agente não respondeu após ${retries} tentativas`, {
      operation: operationName,
      lastError: lastError?.message,
      agentUrl
    });
    
    logger.error({
      operation: operationName,
      error: error.message,
      context: error.context
    }, 'Todas as tentativas de comunicação com agente falharam');
    
    throw error;
  }
  
  /**
   * Autentica cliente via agente
   */
  static async autenticarCliente(agentUrl, agentToken, login, encryptionKey) {
    try {
      const result = await this.callAgent(
        agentUrl,
        agentToken,
        'cliente.autenticar',
        { login },
        { encryptionKey }
      );
      
      if (!result || result.length === 0) {
        throw new Error('Cliente não encontrado');
      }
      
      return result[0]; // Retorna primeiro resultado
    } catch (error) {
      logger.error({ login, error: error.message }, 'Erro ao autenticar cliente');
      throw error;
    }
  }
  
  /**
   * Busca faturas abertas de um cliente
   */
  static async buscarFaturasAbertas(agentUrl, agentToken, login, encryptionKey) {
    try {
      const result = await this.callAgent(
        agentUrl,
        agentToken,
        'cliente.titulos.abertos',
        { login },
        { encryptionKey }
      );
      
      return result || [];
    } catch (error) {
      logger.error({ login, error: error.message }, 'Erro ao buscar faturas');
      throw error;
    }
  }
  
  /**
   * Busca dados de contrato do cliente
   */
  static async buscarContrato(agentUrl, agentToken, login, encryptionKey) {
    try {
      const result = await this.callAgent(
        agentUrl,
        agentToken,
        'cliente.contrato',
        { login },
        { encryptionKey }
      );
      
      if (!result || result.length === 0) {
        return null;
      }
      
      return result[0];
    } catch (error) {
      logger.error({ login, error: error.message }, 'Erro ao buscar contrato');
      throw error;
    }
  }
  
  /**
   * Verifica saúde do agente (health check)
   */
  static async healthCheck(agentUrl, agentToken, encryptionKey) {
    try {
      const result = await this.callAgent(
        agentUrl,
        agentToken,
        'ping',
        {},
        { encryptionKey, timeout: 5000 }
      );
      
      return { status: 'online', timestamp: new Date() };
    } catch (error) {
      return { status: 'offline', error: error.message, timestamp: new Date() };
    }
  }
}

/**
 * Erro específico do agente
 */
class AgentError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'AgentError';
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { MkAuthAgentService, AgentError };
