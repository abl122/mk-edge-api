const jwt = require('jsonwebtoken');
const TenantService = require('../services/TenantService');
const logger = require('../../logger');

/**
 * Middleware de Multi-Tenant
 * 
 * Responsável por:
 * - Extrair tenant_id da requisição (query, body, JWT)
 * - Carregar dados do tenant do MongoDB
 * - Validar se o tenant existe e está ativo
 * - Injetar tenant no objeto req
 * 
 * Uso:
 * - Aplique a todos os endpoints protegidos
 * - Processa tenant_id em ordem: JWT > query > body
 */

/**
 * Extrai tenant_id de diferentes fontes
 */
function extractTenantId(req) {
  // 1. Tenta extrair do JWT
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace('Bearer ', '');
      const decoded = jwt.decode(token);
      
      if (decoded?.tenant_id) {
        logger.debug('Tenant extraído do JWT', { tenant_id: decoded.tenant_id });
        return decoded.tenant_id;
      }
    } catch (error) {
      logger.debug('Erro ao decodificar JWT para tenant', { error: error.message });
    }
  }

  // 2. Tenta extrair do query string
  if (req.query.tenant_id) {
    logger.debug('Tenant extraído do query', { tenant_id: req.query.tenant_id });
    return req.query.tenant_id;
  }

  // 3. Tenta extrair do body
  if (req.body?.tenant_id) {
    logger.debug('Tenant extraído do body', { tenant_id: req.body.tenant_id });
    return req.body.tenant_id;
  }

  // 4. Tenta extrair do header customizado
  if (req.headers['x-tenant-id']) {
    logger.debug('Tenant extraído do header', { tenant_id: req.headers['x-tenant-id'] });
    return req.headers['x-tenant-id'];
  }

  return null;
}

/**
 * Middleware principal de multi-tenant
 * 
 * @param {Object} options - Opções do middleware
 * @param {boolean} options.required - Se tenant é obrigatório (default: true)
 * @param {boolean} options.validateActive - Valida se tenant está ativo (default: true)
 */
function tenantMiddleware(options = {}) {
  const { required = true, validateActive = true } = options;

  return async (req, res, next) => {
    try {
      // Extrai tenant_id
      const tenantId = extractTenantId(req);

      if (!tenantId) {
        if (required) {
          logger.warn('Tenant_id não fornecido em requisição obrigatória', {
            method: req.method,
            path: req.path,
            ip: req.ip
          });
          
          return res.status(400).json({
            error: 'tenant_id requerido',
            message: 'Forneça tenant_id via query, body, header x-tenant-id ou JWT'
          });
        }

        // Tenant não obrigatório
        req.tenant = null;
        return next();
      }

      // Busca tenant no MongoDB
      let tenant;
      try {
        tenant = await TenantService.findById(tenantId);
      } catch (dbError) {
        logger.error('Erro ao buscar tenant no MongoDB', {
          tenant_id: tenantId,
          error: dbError.message
        });
        
        return res.status(500).json({
          error: 'Erro ao validar tenant',
          message: 'Não foi possível validar o provedor'
        });
      }

      if (!tenant) {
        logger.warn('Tenant não encontrado', {
          tenant_id: tenantId,
          method: req.method,
          path: req.path
        });

        return res.status(404).json({
          error: 'Tenant não encontrado',
          message: 'O provedor solicitado não existe'
        });
      }

      // Valida se o tenant está ativo
      if (validateActive && !tenant.assinaturaAtiva?.()) {
        logger.warn('Tenant inativo', {
          tenant_id: tenantId,
          ativo: tenant.assinatura?.ativa,
          data_fim: tenant.assinatura?.data_fim
        });

        return res.status(403).json({
          error: 'Tenant inativo',
          message: 'A assinatura do provedor está inativa'
        });
      }

      // Injeta tenant no request
      req.tenant = tenant;
      req.tenant_id = tenantId;

      logger.debug('Tenant carregado com sucesso', {
        tenant_id: tenantId,
        tenant_nome: tenant.provedor?.nome,
        agente_ativo: tenant.agente?.ativo
      });

      next();

    } catch (error) {
      logger.error('Erro no middleware de tenant', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        error: 'Erro interno',
        message: 'Erro ao processar tenant'
      });
    }
  };
}

/**
 * Middleware que apenas injeta tenant se disponível (não obrigatório)
 */
function optionalTenantMiddleware() {
  return tenantMiddleware({ required: false });
}

/**
 * Middleware que carrega tenant sem validar se está ativo
 */
function tenantMiddlewareNoValidation() {
  return tenantMiddleware({ validateActive: false });
}

module.exports = {
  tenantMiddleware,
  optionalTenantMiddleware,
  tenantMiddlewareNoValidation,
  extractTenantId
};
