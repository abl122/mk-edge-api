/**
 * AuthController - Autenticação de Usuários
 * Admin: admin/F@lcon2931
 * Portal: CNPJ/Senha criada no cadastro
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../schemas/User');
const Tenant = require('../schemas/Tenant');
const logger = require('../../logger');

class AuthController {
  /**
   * Login Admin
   * POST /api/auth/admin/login
   */
  static async loginAdmin(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Usuário e senha são obrigatórios'
        });
      }

      // Buscar usuário no MongoDB com role admin
      const user = await User.findOne({ 
        login: username,
        roles: { $in: ['admin'] }
      });

      if (!user) {
        logger.warn('Tentativa de login admin com usuário não encontrado', { username });
        return res.status(401).json({
          success: false,
          message: 'Usuário ou senha incorretos'
        });
      }

      // Verificar se usuário está bloqueado
      if (user.bloqueado) {
        logger.warn('Tentativa de login com usuário bloqueado', { username });
        return res.status(401).json({
          success: false,
          message: 'Usuário bloqueado'
        });
      }

      // Comparar senha
      const senhaValida = await bcrypt.compare(password, user.senha);
      if (!senhaValida) {
        logger.warn('Tentativa de login admin com senha incorreta', { username });
        return res.status(401).json({
          success: false,
          message: 'Usuário ou senha incorretos'
        });
      }

      // Gerar JWT
      const token = jwt.sign(
        { 
          role: 'admin', 
          username: user.login,
          userId: user._id.toString()
        },
        process.env.JWT_SECRET || 'mk-edge-secret-2026',
        { expiresIn: process.env.JWT_EXPIRES_IN || '15d' }
      );

      // Atualizar último login
      await User.updateOne(
        { _id: user._id },
        { ultimo_login: new Date() }
      );

      logger.info('Login admin realizado com sucesso', { username });

      res.json({
        success: true,
        token,
        user: {
          id: user._id.toString(),
          username: user.login,
          nome: user.nome,
          email: user.email,
          role: 'admin'
        }
      });
    } catch (error) {
      logger.error('Erro ao fazer login admin:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao fazer login'
      });
    }
  }

  /**
   * Login Portal (Tenant)
   * POST /api/auth/portal/login
   */
  static async loginPortal(req, res) {
    try {
      const { cnpj, password } = req.body;

      if (!cnpj || !password) {
        return res.status(400).json({
          success: false,
          message: 'CNPJ e senha são obrigatórios'
        });
      }

      // Buscar usuário no MongoDB usando o login (CNPJ)
      const user = await User.findOne({ 
        login: cnpj,
        roles: { $in: ['portal'] }
      }).populate('tenant_id');

      if (!user) {
        logger.warn('Tentativa de login portal com CNPJ não encontrado', { cnpj });
        return res.status(401).json({
          success: false,
          message: 'CNPJ ou senha incorretos'
        });
      }

      // Verificar se usuário está bloqueado
      if (user.bloqueado) {
        logger.warn('Tentativa de login portal com usuário bloqueado', { cnpj });
        return res.status(401).json({
          success: false,
          message: 'Usuário bloqueado'
        });
      }

      // Comparar senha
      const senhaValida = await bcrypt.compare(password, user.senha);
      if (!senhaValida) {
        logger.warn('Tentativa de login portal com senha incorreta', { cnpj });
        return res.status(401).json({
          success: false,
          message: 'CNPJ ou senha incorretos'
        });
      }

      // Gerar JWT
      const token = jwt.sign(
        { 
          role: 'portal',
          userId: user._id.toString(),
          tenantId: user.tenant_id._id.toString(),
          login: user.login
        },
        process.env.JWT_SECRET || 'mk-edge-secret-2026',
        { expiresIn: process.env.JWT_EXPIRES_IN || '15d' }
      );

      // Atualizar último login
      await User.updateOne(
        { _id: user._id },
        { ultimo_login: new Date() }
      );

      logger.info('Login portal realizado com sucesso', { cnpj });

      // Incluir token do agente no retorno para exibir na tela de instalacao
      const agente = user.tenant_id?.agente || null;

      res.json({
        success: true,
        token,
        user: {
          id: user._id.toString(),
          nome: user.nome,
          email: user.email,
          login: user.login,
          role: 'portal',
          tenant_id: user.tenant_id._id.toString()
        },
        tenant: {
          id: user.tenant_id._id.toString(),
          nome: user.tenant_id.provedor?.nome || user.nome,
          cnpj: user.login,
          plano: user.tenant_id.plano_atual || 'trial',
          agente: agente
            ? {
                url: agente.url || null,
                token: agente.token || null,
                ativo: agente.ativo ?? false
              }
            : null
        }
      });
    } catch (error) {
      logger.error('Erro ao fazer login portal:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao fazer login'
      });
    }
  }

  /**
   * Logout
   * POST /api/auth/logout
   */
  static async logout(req, res) {
    res.json({
      success: true,
      message: 'Desconectado com sucesso'
    });
  }

  /**
   * Verificar Token
   * GET /api/auth/verify
   */
  static async verify(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Token não fornecido'
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mk-edge-secret-2026');
      
      res.json({
        success: true,
        user: decoded
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }
  }

  /**
   * Obter dados do usuário logado
   * GET /api/me
   */
  static async me(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Token não fornecido'
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mk-edge-secret-2026');
      
      // Buscar usuário no MongoDB
      const user = await User.findById(decoded.userId).lean();
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      res.json({
        success: true,
        user: {
          id: user._id.toString(),
          nome: user.nome,
          email: user.email,
          login: user.login,
          roles: user.roles,
          tenant_id: user.tenant_id ? user.tenant_id.toString() : null
        }
      });
    } catch (error) {
      logger.error('Erro ao obter dados do usuário:', error);
      res.status(401).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }
  }
}

module.exports = AuthController;
