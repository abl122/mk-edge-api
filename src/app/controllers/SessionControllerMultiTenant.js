const AuthService = require('../services/AuthService');
const User = require('../schemas/User');
const TenantService = require('../services/TenantService');
const logger = require('../../logger');

/**
 * SessionController - Gerenciamento de Sessões Multi-Tenant
 * 
 * Implementa autenticação e validação de sessões com suporte a múltiplos tenants
 */
class SessionController {
  
  /**
   * Login do usuário
   * 
   * POST /login
   * Body:
   * {
   *   "login": "usuario123",
   *   "senha": "senha123",
   *   "tenant_id": "63dd998b885eb427c8c51958" // opcional se em JWT
   * }
   */
  async store(req, res) {
    try {
      const { login, senha, tenant_id } = req.body;

      // Valida entrada
      if (!login || !senha) {
        logger.warn('Login sem credenciais', {
          path: req.path,
          ip: req.ip
        });
        
        return res.status(400).json({
          error: 'login e senha são obrigatórios'
        });
      }

      // Se tenant_id não foi fornecido, tenta extrair de req.tenant
      const tenantId = tenant_id || req.tenant?._id;

      if (!tenantId) {
        logger.warn('Tentativa de login sem tenant', {
          login,
          ip: req.ip
        });

        return res.status(400).json({
          error: 'tenant_id é obrigatório'
        });
      }

      // Realiza login
      const resultado = await AuthService.login(login, senha, tenantId);

      logger.info('Login bem-sucedido', {
        login,
        tenant_id: tenantId,
        tenant_nome: resultado.tenant?.nome
      });

      return res.json({
        success: true,
        user: resultado.user,
        token: resultado.token,
        refreshToken: resultado.refreshToken,
        tenant: resultado.tenant
      });

    } catch (error) {
      logger.error('Erro ao fazer login', {
        error: error.message,
        login: req.body?.login
      });

      // Retorna mensagem genérica para segurança
      return res.status(401).json({
        error: 'Credenciais inválidas ou tenant não encontrado'
      });
    }
  }

  /**
   * Refresh de token
   * 
   * POST /refresh
   * Body:
   * {
   *   "refreshToken": "eyJhbGc..."
   * }
   */
  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          error: 'refreshToken é obrigatório'
        });
      }

      const resultado = await AuthService.refreshToken(refreshToken);

      return res.json({
        success: true,
        token: resultado.token,
        refreshToken: resultado.refreshToken
      });

    } catch (error) {
      logger.warn('Erro ao renovar token', {
        error: error.message
      });

      return res.status(401).json({
        error: 'Token inválido ou expirado'
      });
    }
  }

  /**
   * Logout
   * 
   * POST /logout
   * Headers:
   * {
   *   "Authorization": "Bearer eyJhbGc..."
   * }
   */
  async logout(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (token) {
        await AuthService.logout(token);
      }

      logger.info('Logout realizado', {
        user_id: req.user?.id,
        tenant_id: req.tenant_id
      });

      return res.json({
        success: true,
        message: 'Logout realizado com sucesso'
      });

    } catch (error) {
      logger.error('Erro ao fazer logout', {
        error: error.message
      });

      return res.status(500).json({
        error: 'Erro ao fazer logout'
      });
    }
  }

  /**
   * Valida token JWT
   * 
   * POST /validate
   * Headers:
   * {
   *   "Authorization": "Bearer eyJhbGc..."
   * }
   */
  async validate(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(400).json({
          error: 'Token não fornecido'
        });
      }

      const payload = AuthService.validarToken(token);

      // Busca usuário para confirmar que ainda existe e está ativo
      const user = await User.findById(payload.id);

      if (!user || !user.ativo) {
        return res.status(401).json({
          error: 'Usuário não encontrado ou inativo'
        });
      }

      return res.json({
        success: true,
        valid: true,
        user: user.toPublic(),
        payload
      });

    } catch (error) {
      logger.warn('Validação de token falhou', {
        error: error.message
      });

      return res.status(401).json({
        success: false,
        valid: false,
        error: 'Token inválido'
      });
    }
  }

  /**
   * Obtém informações da sessão atual
   * 
   * GET /me
   * Headers:
   * {
   *   "Authorization": "Bearer eyJhbGc..."
   * }
   */
  async me(req, res) {
    try {
      if (!req.user || !req.tenant) {
        return res.status(401).json({
          error: 'Não autenticado'
        });
      }

      // Busca usuário e tenant atualizados
      const user = await User.findById(req.user.id);
      const tenant = req.tenant;

      if (!user) {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }

      return res.json({
        user: user.toPublic(),
        tenant: {
          _id: tenant._id,
          nome: tenant.provedor?.nome,
          agente_ativo: tenant.agente?.ativo
        }
      });

    } catch (error) {
      logger.error('Erro ao buscar sessão atual', {
        error: error.message
      });

      return res.status(500).json({
        error: 'Erro ao buscar informações da sessão'
      });
    }
  }

  /**
   * Altera a senha do usuário
   * 
   * POST /change-password
   * Headers:
   * {
   *   "Authorization": "Bearer eyJhbGc..."
   * }
   * Body:
   * {
   *   "senhaAtual": "senha123",
   *   "novaSenha": "novasenha123"
   * }
   */
  async changePassword(req, res) {
    try {
      const { senhaAtual, novaSenha } = req.body;

      if (!req.user) {
        return res.status(401).json({
          error: 'Não autenticado'
        });
      }

      if (!senhaAtual || !novaSenha) {
        return res.status(400).json({
          error: 'Senha atual e nova senha são obrigatórias'
        });
      }

      if (novaSenha.length < 6) {
        return res.status(400).json({
          error: 'Nova senha deve ter no mínimo 6 caracteres'
        });
      }

      // Busca usuário
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }

      // Valida senha atual
      const senhaValida = await user.compareSenha(senhaAtual);

      if (!senhaValida) {
        logger.warn('Tentativa de alterar senha com senha incorreta', {
          user_id: user._id,
          tenant_id: user.tenant_id
        });

        return res.status(401).json({
          error: 'Senha atual inválida'
        });
      }

      // Altera senha
      user.senha = novaSenha;
      await user.save();

      logger.info('Senha alterada com sucesso', {
        user_id: user._id,
        tenant_id: user.tenant_id
      });

      return res.json({
        success: true,
        message: 'Senha alterada com sucesso'
      });

    } catch (error) {
      logger.error('Erro ao alterar senha', {
        error: error.message
      });

      return res.status(500).json({
        error: 'Erro ao alterar senha'
      });
    }
  }
}

module.exports = SessionController;
