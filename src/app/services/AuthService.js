const jwt = require('jsonwebtoken');
const User = require('../schemas/User');
const TenantService = require('./TenantService');
const logger = require('../../logger');

/**
 * Serviço de Autenticação Multi-Tenant
 * 
 * Responsável por:
 * - Login de usuários em um tenant específico
 * - Geração de JWT com tenant_id
 * - Validação de tokens
 * - Refreshing de tokens
 */
class AuthService {
  /**
   * Login do usuário
   * 
   * @param {string} login - Login do usuário
   * @param {string} senha - Senha do usuário
   * @param {string} tenantId - ID do tenant
   * @returns {Promise<Object>} { user, token, refreshToken }
   */
  static async login(login, senha, tenantId) {
    try {
      // Valida tenant
      const tenant = await TenantService.findById(tenantId);
      if (!tenant) {
        logger.warn('Tenant não encontrado no login', { tenant_id: tenantId });
        throw new Error('Tenant não encontrado');
      }

      // Se tenant não está ativo, nega login
      if (!tenant.assinaturaAtiva?.()) {
        logger.warn('Tentativa de login em tenant inativo', {
          tenant_id: tenantId,
          login
        });
        throw new Error('Tenant inativo');
      }

      // Busca usuário no tenant específico
      const user = await User.findByLoginAndTenant(login, tenantId);

      if (!user) {
        logger.warn('Usuário não encontrado', {
          login,
          tenant_id: tenantId
        });
        throw new Error('Credenciais inválidas');
      }

      // Verifica se usuário está ativo
      if (!user.ativo) {
        logger.warn('Tentativa de login com usuário inativo', {
          login,
          tenant_id: tenantId
        });
        throw new Error('Usuário inativo');
      }

      // Verifica se usuário está bloqueado
      if (user.bloqueado) {
        logger.warn('Tentativa de login com usuário bloqueado', {
          login,
          tenant_id: tenantId,
          motivo: user.motivo_bloqueio
        });
        throw new Error('Usuário bloqueado');
      }

      // Valida senha
      const senhaValida = await user.compareSenha(senha);
      if (!senhaValida) {
        // Incrementa tentativas de falha
        user.tentativas_login = (user.tentativas_login || 0) + 1;
        user.ultima_tentativa = new Date();

        // Bloqueia após 5 tentativas
        if (user.tentativas_login >= 5) {
          user.bloqueado = true;
          user.motivo_bloqueio = 'Muitas tentativas de login falhadas';
          logger.warn('Usuário bloqueado por tentativas excessivas', {
            login,
            tenant_id: tenantId
          });
        }

        await user.save();

        logger.warn('Senha inválida', {
          login,
          tenant_id: tenantId,
          tentativas: user.tentativas_login
        });

        throw new Error('Credenciais inválidas');
      }

      // Reset de tentativas falhadas
      user.tentativas_login = 0;
      user.ultimo_login = new Date();
      user.ultima_tentativa = null;
      await user.save();

      // Gera tokens
      const { token, refreshToken } = this.gerarTokens(user, tenant);

      logger.info('Usuário logado com sucesso', {
        login,
        tenant_id: tenantId,
        tenant_nome: tenant.provedor?.nome
      });

      return {
        user: user.toPublic(),
        token,
        refreshToken,
        tenant: {
          _id: tenant._id,
          nome: tenant.provedor?.nome,
          agente_ativo: tenant.agente?.ativo
        }
      };

    } catch (error) {
      logger.error('Erro no login', {
        login,
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Gera tokens JWT e Refresh Token
   * 
   * @param {Object} user - Documento de usuário
   * @param {Object} tenant - Documento de tenant
   * @returns {Object} { token, refreshToken }
   */
  static gerarTokens(user, tenant) {
    const jwtSecret = process.env.JWT_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

    // Token de acesso
    const token = jwt.sign(
      {
        id: user._id.toString(),
        login: user.login,
        email: user.email,
        nome: user.nome,
        tenant_id: user.tenant_id.toString(),
        roles: user.roles,
        permissoes: user.permissoes
      },
      jwtSecret,
      { expiresIn }
    );

    // Refresh token (válido por 30 dias)
    const refreshToken = jwt.sign(
      {
        id: user._id.toString(),
        tenant_id: user.tenant_id.toString(),
        type: 'refresh'
      },
      jwtSecret,
      { expiresIn: '30d' }
    );

    return { token, refreshToken };
  }

  /**
   * Valida um JWT
   * 
   * @param {string} token - Token JWT
   * @returns {Object} Payload decodificado
   */
  static validarToken(token) {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      const payload = jwt.verify(token, jwtSecret);
      return payload;
    } catch (error) {
      logger.warn('Token inválido ou expirado', {
        error: error.message
      });
      throw new Error('Token inválido ou expirado');
    }
  }

  /**
   * Refresh de token
   * 
   * @param {string} refreshToken - Refresh token
   * @returns {Object} { token, refreshToken }
   */
  static async refreshToken(refreshToken) {
    try {
      // Valida refresh token
      const payload = this.validarToken(refreshToken);

      if (payload.type !== 'refresh') {
        throw new Error('Tipo de token inválido');
      }

      // Busca usuário e tenant
      const user = await User.findById(payload.id).populate('tenant_id');
      const tenant = user.tenant_id;

      if (!user || !tenant) {
        throw new Error('Usuário ou tenant não encontrado');
      }

      // Verifica se estão ativos
      if (!user.ativo || !tenant.assinaturaAtiva?.()) {
        throw new Error('Usuário ou tenant não está ativo');
      }

      // Gera novos tokens
      const { token, refreshToken: newRefreshToken } = this.gerarTokens(user, tenant);

      logger.info('Token renovado com sucesso', {
        user_id: user._id,
        tenant_id: tenant._id
      });

      return {
        token,
        refreshToken: newRefreshToken
      };

    } catch (error) {
      logger.error('Erro ao renovar token', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Logout (aqui você pode adicionar blacklist de tokens se necessário)
   * 
   * @param {string} token - Token sendo revogado
   */
  static async logout(token) {
    // Implementar blacklist se necessário
    logger.info('Usuário fez logout');
  }
}

module.exports = AuthService;
