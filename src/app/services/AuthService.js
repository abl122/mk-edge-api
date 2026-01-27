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
   * @param {string} tenantId - ID do tenant (opcional para admin, obrigatório para portal)
   * @returns {Promise<Object>} { user, token, refreshToken }
   */
  static async login(login, senha, tenantId = null) {
    try {
      let user = null;
      let tenant = null;

      // Se tenantId foi fornecido, é login de usuário portal
      if (tenantId) {
        // Valida tenant
        tenant = await TenantService.findById(tenantId);
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
          throw new Error('Provedor com assinatura inativa');
        }

        // Busca usuário no tenant específico
        user = await User.findByLogin(login, tenantId);

        if (!user) {
          logger.warn('Usuário portal não encontrado', {
            login,
            tenant_id: tenantId
          });
          throw new Error('Credenciais inválidas');
        }

        // Valida que é usuário portal
        if (!user.roles.includes('portal') && !user.roles.includes('gerente') && !user.roles.includes('tecnico')) {
          logger.warn('Usuário sem role portal tentou acessar', {
            login,
            roles: user.roles
          });
          throw new Error('Credenciais inválidas');
        }
      } else {
        // Sem tenantId = login de admin global
        user = await User.findByLogin(login, null);

        if (!user) {
          logger.warn('Usuário admin não encontrado', { login });
          throw new Error('Credenciais inválidas');
        }

        // Valida que é admin
        if (!user.roles.includes('admin')) {
          logger.warn('Usuário não-admin tentou login sem tenant', {
            login,
            roles: user.roles
          });
          throw new Error('Acesso negado');
        }
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
        throw new Error(user.motivo_bloqueio || 'Usuário bloqueado');
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
        role: user.roles[0],
        tipo: tenantId ? 'portal' : 'admin'
      });

      const response = {
        user: user.toPublic(),
        token,
        refreshToken
      };

      // Adiciona informações do tenant se for login portal
      if (tenant) {
        response.tenant = {
          _id: tenant._id,
          nome: tenant.provedor?.nome,
          agente_ativo: tenant.agente?.ativo
        };
      }

      return response;

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
   * @param {Object} tenant - Documento de tenant (null para admin)
   * @returns {Object} { token, refreshToken }
   */
  static gerarTokens(user, tenant = null) {
    const jwtSecret = process.env.JWT_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

    const payload = {
      id: user._id.toString(),
      login: user.login,
      email: user.email,
      nome: user.nome,
      roles: user.roles,
      permissoes: user.permissoes
    };

    // Adiciona tenant_id apenas se existir (usuários portal)
    if (tenant && tenant._id) {
      payload.tenant_id = tenant._id.toString();
    } else if (user.tenant_id) {
      payload.tenant_id = user.tenant_id.toString();
    }

    // Token de acesso
    const token = jwt.sign(payload, jwtSecret, { expiresIn });

    // Refresh token (válido por 30 dias)
    const refreshPayload = {
      id: user._id.toString(),
      type: 'refresh'
    };
    
    if (payload.tenant_id) {
      refreshPayload.tenant_id = payload.tenant_id;
    }

    const refreshToken = jwt.sign(refreshPayload, jwtSecret, { expiresIn: '30d' });

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

      // Busca usuário
      const user = await User.findById(payload.id);
      
      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      let tenant = null;
      
      // Se usuário tem tenant_id, valida o tenant
      if (user.tenant_id) {
        tenant = await TenantService.findById(user.tenant_id);
        
        if (!tenant) {
          throw new Error('Tenant não encontrado');
        }
        
        // Verifica se tenant está ativo
        if (!tenant.assinaturaAtiva?.()) {
          throw new Error('Provedor com assinatura inativa');
        }
      }

      // Verifica se usuário está ativo
      if (!user.ativo) {
        throw new Error('Usuário não está ativo');
      }

      // Gera novos tokens
      const { token, refreshToken: newRefreshToken } = this.gerarTokens(user, tenant);

      logger.info('Token renovado com sucesso', {
        user_id: user._id,
        tenant_id: user.tenant_id
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
