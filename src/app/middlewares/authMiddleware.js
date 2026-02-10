const AuthService = require('../services/AuthService');
const User = require('../schemas/User');
const logger = require('../../logger');

/**
 * Middleware de Autenticação JWT
 * 
 * Valida e injeta informações do JWT em req.user
 */

/**
 * Middleware de autenticação obrigatória
 * Aceita JWT (Bearer) ou Basic Auth (compatibilidade com app antigo)
 */
async function authMiddleware(req, res, next) {
  console.log('🔐 authMiddleware - START', req.method, req.path);
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.log('❌ authMiddleware - SEM TOKEN');
      logger.warn('Requisição sem token', {
        method: req.method,
        path: req.path,
        ip: req.ip
      });

      return res.status(401).json({
        error: 'Token não fornecido',
        message: 'Forneça um token JWT no header Authorization: Bearer <token>'
      });
    }

    // Verifica se é JWT (Bearer) ou Basic Auth
    if (authHeader.startsWith('Bearer ')) {
      // Autenticação JWT
      const token = authHeader.replace('Bearer ', '');
      const payload = AuthService.validarToken(token);

      req.user = {
        id: payload.id,
        login: payload.login,
        email: payload.email,
        nome: payload.nome,
        tenant_id: payload.tenant_id,
        roles: payload.roles,
        permissoes: payload.permissoes
      };
      req.tenant_id = payload.tenant_id;

      logger.debug('Usuário autenticado via JWT', {
        user_id: payload.id,
        tenant_id: payload.tenant_id,
        login: payload.login
      });
    } else if (authHeader.startsWith('Basic ')) {
      // Autenticação Basic (formato: Basic base64(login:timestamp))
      const token = authHeader.replace('Basic ', '');
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [login, timestamp] = decoded.split(':');

      if (!login || !timestamp) {
        throw new Error('Basic Auth inválido');
      }

      // Valida timestamp (máximo 15 dias para compatibilidade com JWT)
      const now = Date.now();
      const tokenAge = now - parseInt(timestamp);
      const maxAge = 15 * 24 * 60 * 60 * 1000; // 15 dias

      if (tokenAge > maxAge) {
        throw new Error('Token expirado');
      }

      // Extrai tenant_id dos possíveis locais
      let tenantId = req.tenant?._id || req.query.tenant_id || req.body.tenant_id;

      // Se não encontrou tenant_id, tenta do header
      if (!tenantId) {
        tenantId = req.headers['x-tenant-id'];
      }

      // Carrega tenant do MongoDB se tenantId foi fornecido
      if (tenantId) {
        try {
          const Tenant = require('../schemas/Tenant');
          req.tenant = await Tenant.findById(tenantId);
          
          if (!req.tenant) {
            throw new Error('Tenant não encontrado');
          }
        } catch (dbError) {
          logger.warn('Erro ao carregar tenant para Basic Auth', {
            tenant_id: tenantId,
            error: dbError.message
          });
          // Continua mesmo se não conseguir carregar tenant
        }
      }

      // Injeta informações básicas do usuário
      req.user = {
        login,
        isAdmin: true, // Assume admin para compatibilidade
        tenant_id: tenantId
      };
      req.tenant_id = tenantId;

      logger.debug('Usuário autenticado via Basic Auth', {
        login,
        tenant_id: tenantId
      });
    } else {
      throw new Error('Formato de autenticação não suportado');
    }

    next();

  } catch (error) {
    logger.warn('Token inválido ou expirado', {
      error: error.message,
      path: req.path
    });

    return res.status(401).json({
      error: 'Token inválido ou expirado',
      message: error.message
    });
  }
}

/**
 * Middleware de autenticação opcional
 * Se tiver token válido, injeta usuário. Se não, continua sem.
 */
function optionalAuthMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      const payload = AuthService.validarToken(token);
      req.user = {
        id: payload.id,
        login: payload.login,
        email: payload.email,
        nome: payload.nome,
        tenant_id: payload.tenant_id,
        roles: payload.roles,
        permissoes: payload.permissoes
      };
      req.tenant_id = payload.tenant_id;

      logger.debug('Usuário autenticado (optional)', {
        user_id: payload.id
      });
    }

    next();

  } catch (error) {
    // Ignora erro e continua sem autenticação
    logger.debug('Token inválido em autenticação opcional', {
      error: error.message
    });
    next();
  }
}

/**
 * Middleware de validação de role/permissão
 * 
 * @param {string|string[]} roles - Roles requeridas
 * @returns {Function} Middleware
 */
function requireRole(roles) {
  const rolesArray = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Não autenticado'
      });
    }

    // Verifica se usuário tem uma das roles
    const temRole = rolesArray.some(role => 
      req.user.roles?.includes(role) || req.user.roles?.includes('admin')
    );

    if (!temRole) {
      logger.warn('Usuário sem permissão (role)', {
        user_id: req.user.id,
        roles_requeridas: rolesArray,
        roles_usuario: req.user.roles,
        path: req.path
      });

      return res.status(403).json({
        error: 'Permissão negada',
        message: `Você precisa de uma destas roles: ${rolesArray.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Middleware de validação de permissão específica
 * 
 * @param {string|string[]} permissoes - Permissões requeridas
 * @returns {Function} Middleware
 */
function requirePermission(permissoes) {
  const permissoesArray = Array.isArray(permissoes) ? permissoes : [permissoes];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Não autenticado'
      });
    }

    // Se é admin, autoriza tudo
    if (req.user.roles?.includes('admin')) {
      return next();
    }

    // Verifica se tem uma das permissões
    const temPermissao = permissoesArray.some(perm => 
      req.user.permissoes?.includes(perm)
    );

    if (!temPermissao) {
      logger.warn('Usuário sem permissão', {
        user_id: req.user.id,
        permissoes_requeridas: permissoesArray,
        permissoes_usuario: req.user.permissoes,
        path: req.path
      });

      return res.status(403).json({
        error: 'Permissão negada',
        message: `Você precisa de uma destas permissões: ${permissoesArray.join(', ')}`
      });
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  requireRole,
  requirePermission
};
