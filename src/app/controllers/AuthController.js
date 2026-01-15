/**
 * AuthController - Autenticação de Usuários
 * Admin: admin/F@lcon2931
 * Portal: CNPJ/Senha criada no cadastro
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class AuthController {
  /**
   * Login Admin
   * POST /api/auth/admin/login
   */
  static async loginAdmin(req, res) {
    try {
      const { username, password } = req.body;

      // Credenciais hardcoded do admin
      const ADMIN_USER = 'admin';
      const ADMIN_PASS = 'F@lcon2931';

      if (username !== ADMIN_USER || password !== ADMIN_PASS) {
        return res.status(401).json({
          success: false,
          message: 'Usuário ou senha incorretos'
        });
      }

      // Gerar JWT
      const token = jwt.sign(
        { role: 'admin', username: 'admin' },
        process.env.JWT_SECRET || 'mk-edge-secret-2026',
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        user: {
          username: 'admin',
          role: 'admin'
        }
      });
    } catch (error) {
      console.error('Erro ao fazer login admin:', error);
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

      // TODO: Buscar tenant no MongoDB por CNPJ
      // const tenant = await Tenant.findOne({ 'provedor.cnpj': cnpj });
      
      // Mock para testes
      const mockTenant = {
        _id: 'mk-edge-test-001',
        provedor: {
          cnpj: '12345678901234',
          nome: 'Provedor Test',
          email: 'admin@provedor.com'
        },
        assinatura: {
          plano: 'professional',
          ativa: true
        }
      };

      // Verificar CNPJ (mock)
      if (cnpj !== mockTenant.provedor.cnpj) {
        return res.status(401).json({
          success: false,
          message: 'CNPJ ou senha incorretos'
        });
      }

      // Verificar senha (mock - em produção buscar do BD)
      const correctPassword = 'senha123'; // Mock
      if (password !== correctPassword) {
        return res.status(401).json({
          success: false,
          message: 'CNPJ ou senha incorretos'
        });
      }

      // Gerar JWT
      const token = jwt.sign(
        { 
          role: 'tenant',
          tenantId: mockTenant._id,
          cnpj: mockTenant.provedor.cnpj
        },
        process.env.JWT_SECRET || 'mk-edge-secret-2026',
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        token,
        tenant: {
          id: mockTenant._id,
          nome: mockTenant.provedor.nome,
          cnpj: mockTenant.provedor.cnpj,
          plano: mockTenant.assinatura.plano
        }
      });
    } catch (error) {
      console.error('Erro ao fazer login portal:', error);
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
      
      // Mock data baseado no role
      if (decoded.role === 'tenant') {
        return res.json({
          id: decoded.tenantId,
          nome: 'Provedor Test',
          cnpj: decoded.cnpj,
          email: 'admin@provedor.com',
          role: 'tenant',
          plano: 'professional'
        });
      }
      
      if (decoded.role === 'admin') {
        return res.json({
          username: decoded.username,
          role: 'admin'
        });
      }

      res.json(decoded);
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }
  }
}

module.exports = AuthController;
