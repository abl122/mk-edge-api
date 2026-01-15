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
 */
function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
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

    // Valida token
    const payload = AuthService.validarToken(token);

    // Injeta informações do usuário no request
    req.user = {
      id: payload.id,
      login: payload.login,
      email: payload.email,
      nome: payload.nome,
      tenant_id: payload.tenant_id,
      roles: payload.roles,
      permissoes: payload.permissoes
    };

    // Também injeta tenant_id para compatibilidade
    req.tenant_id = payload.tenant_id;

    logger.debug('Usuário autenticado', {
      user_id: payload.id,
      tenant_id: payload.tenant_id,
      login: payload.login
    });

    next();

  } catch (error) {
    logger.warn('Token inválido ou expirado', {
      error: error.message,
      path: req.path
    });

    return res.status(401).json({
      error: 'Token inválido ou expirado'
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
