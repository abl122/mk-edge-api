/**
 * SessionController - Gerenciamento de Sessões
 * 
 * Implementa autenticação e validação de sessões de clientes
 */

const sha256 = require('js-sha256');
const bcrypt = require('bcrypt');
const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

/**
 * Valida senha com SHA256 + BCrypt
 * @param {string} password - Senha em texto plano
 * @param {string} hash - Hash armazenado no banco
 * @returns {boolean}
 */
function checkPassword(password, hash) {
  try {
    // Aplica SHA-256 na senha (padrão do sistema)
    const sha256Hash = sha256(password);
    
    // Verifica se é um hash SHA-256 puro (backward compatibility)
    if (sha256Hash === hash) {
      return true;
    }
    
    // Verifica se é hash bcrypt (SHA-256 → bcrypt)
    // Converte $2y$ (PHP) para $2a$ (Node.js) para compatibilidade
    let hashToCompare = hash;
    
    if (hashToCompare && hashToCompare.startsWith('$2y$')) {
      hashToCompare = hashToCompare.replace(/^\$2y\$/, '$2a$');
    }
    
    // Compara SHA-256 da senha com o hash bcrypt
    return bcrypt.compareSync(sha256Hash, hashToCompare);
  } catch (error) {
    logger.error('[SessionController] Erro ao validar senha', {
      error: error.message
    });
    return false;
  }
}

class SessionController {
  async store(req, res) {
    try {
      const { tenant } = req;
      const { login, senha, password } = req.body;
      
      // Aceita tanto 'senha' quanto 'password'
      const senhaFinal = senha || password;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!login || !senhaFinal) {
        return res.status(400).json({
          error: 'Login e senha são obrigatórios'
        });
      }
      
      // Busca usuário no sis_acesso para validar senha
      const query = {
        sql: `SELECT * FROM sis_acesso WHERE login = :login LIMIT 1`,
        params: { login }
      };
      
      const resultado = await MkAuthAgentService.sendToAgent(tenant, query.sql, query.params);
      
      if (!resultado.success || !resultado.data || resultado.data.length === 0) {
        logger.warn('[SessionController] Usuário não encontrado', {
          provedor_id: tenant._id,
          login
        });
        
        return res.status(401).json({
          error: 'Login ou senha inválidos'
        });
      }
      
      const usuario = resultado.data[0];
      
      // Valida senha com SHA256 + BCrypt
      if (!checkPassword(senhaFinal, usuario.sha)) {
        logger.warn('[SessionController] Senha inválida', {
          provedor_id: tenant._id,
          login
        });
        
        return res.status(401).json({
          error: 'Login ou senha inválidos'
        });
      }

      // Verifica se o usuário está ativo
      if (usuario.ativo === 'nao') {
        logger.warn('[SessionController] Usuário inativo tentou login', {
          provedor_id: tenant._id,
          login
        });
        return res.status(403).json({
          error: 'Usuário inativo. Entre em contato com o administrador.'
        });
      }

      // Verifica validade da conta
      if (usuario.validade) {
        const validade = new Date(usuario.validade);
        if (!isNaN(validade.getTime()) && validade < new Date()) {
          logger.warn('[SessionController] Conta expirada tentou login', {
            provedor_id: tenant._id,
            login,
            validade: usuario.validade
          });
          return res.status(403).json({
            error: 'Acesso expirado. Entre em contato com o administrador.'
          });
        }
      }
      
      // Busca funcionário (sis_func) por usuário e por email (compatível com backend antigo)
      let funcionario = null;
      if (usuario.email) {
        const funcByEmail = await MkAuthAgentService.execute(
          tenant,
          'funcionarioPorEmail',
          usuario.email
        );
        funcionario = funcByEmail?.data?.[0] || null;
      }

      // Busca permissões do usuário na sis_perm
      let permissoes = [];
      try {
        const permResult = await MkAuthAgentService.sendToAgent(
          tenant,
          `SELECT nome FROM sis_perm WHERE usuario = :login AND permissao = 'sim'`,
          { login }
        );
        if (permResult.success && Array.isArray(permResult.data)) {
          permissoes = permResult.data.map(p => p.nome).filter(Boolean);
        }
        logger.info('[SessionController] Permissões carregadas', {
          login,
          total: permissoes.length
        });
      } catch (permError) {
        logger.warn('[SessionController] Erro ao buscar sis_perm, usando sem permissões granulares', {
          login,
          error: permError.message
        });
      }
      
      const isAdmin = (usuario.cli_grupos || '').includes('full_clientes');
      const token = Buffer.from(`${login}:${Date.now()}`).toString('base64');
      const idacesso = usuario.idacesso || usuario.id || usuario.id_acesso || null;
      
      logger.info('[SessionController] Login realizado com sucesso', {
        provedor_id: tenant._id,
        login,
        isAdmin,
        totalPermissoes: permissoes.length
      });
      
      // Resposta com permissões granulares do sis_perm
      return res.json({
        user: {
          idacesso,
          nome: usuario.nome,
          employee_id: funcionario ? funcionario.id : null,
          isAdmin,
          tenant_id: tenant._id,
          permissoes
        },
        token
      });
      
    } catch (error) {
      logger.error('[SessionController] Erro ao criar sessão', {
        error: error.message,
        login: req.body.login
      });
      
      return res.status(500).json({
        error: 'Erro ao realizar login',
        message: error.message
      });
    }
  }
  
  /**
   * Valida sessão existente
   * GET /sessions/validate?login=cliente123
   */
  async validate(req, res) {
    try {
      const { tenant } = req;
      const { login } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!login) {
        return res.status(400).json({
          error: 'Login é obrigatório'
        });
      }
      
      // Busca cliente para validar
      const cliente = await MkAuthAgentService.execute(
        tenant,
        'clientePorLogin',
        login
      );
      
      if (!cliente || cliente.length === 0) {
        return res.status(404).json({
          error: 'Sessão inválida',
          valid: false
        });
      }
      
      logger.info('[SessionController] Sessão validada', {
        provedor_id: tenant._id,
        cliente_login: login
      });
      
      return res.json({
        valid: true,
        cliente: cliente[0]
      });
      
    } catch (error) {
      logger.error('[SessionController] Erro ao validar sessão', {
        error: error.message,
        login: req.query.login
      });
      
      return res.status(500).json({
        error: 'Erro ao validar sessão',
        message: error.message
      });
    }
  }
  
  /**
   * Encerra sessão (logout)
   * DELETE /sessions
   */
  async destroy(req, res) {
    try {
      // Logout é apenas do lado do cliente (remover token/sessão local)
      logger.info('[SessionController] Logout solicitado', {
        login: req.body.login
      });
      
      return res.json({
        success: true,
        message: 'Logout realizado com sucesso'
      });
      
    } catch (error) {
      logger.error('[SessionController] Erro ao encerrar sessão', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao encerrar sessão',
        message: error.message
      });
    }
  }
}

module.exports = new SessionController();
