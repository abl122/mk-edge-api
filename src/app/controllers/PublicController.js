/**
 * PublicController
 * 
 * Controlador para endpoints públicos que retornam dados do tenant
 * Não requer autenticação, apenas validação de tenant
 */

const TenantService = require('../services/TenantService');

class PublicController {
  /**
   * GET /public/tenant/:dominio
   * Retorna dados públicos do tenant por domínio
   * 
   * Resposta:
   * {
   *   success: true,
   *   tenant: {
   *     id: string,
   *     nome: string,
   *     razao_social: string,
   *     cnpj: string,
   *     email: string,
   *     telefone: string,
   *     website: string,
   *     logo: string,
   *     cores: { primaria, secundaria },
   *     plano: string
   *   }
   * }
   */
  async getTenantByDomain(req, res) {
    try {
      const { dominio } = req.params;

      if (!dominio) {
        return res.status(400).json({
          success: false,
          error: 'Domínio é obrigatório'
        });
      }

      const tenant = await TenantService.findByDomain(dominio);

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'Tenant não encontrado'
        });
      }

      // Valida se subscription está ativa
      if (!tenant.assinatura?.ativa) {
        return res.status(403).json({
          success: false,
          error: 'Assinatura inativa'
        });
      }

      // Retorna apenas dados públicos (segurança)
      return res.status(200).json({
        success: true,
        tenant: {
          id: tenant._id,
          nome: tenant.provedor.nome,
          razao_social: tenant.provedor.razao_social,
          cnpj: tenant.provedor.cnpj,
          email: tenant.provedor.email,
          telefone: tenant.provedor.telefone,
          dominio: tenant.provedor.dominio,
          website: tenant.provedor.website || null,
          logo: tenant.provedor.logo || null,
          cores: tenant.provedor.cores || {
            primaria: '#2563eb',
            secundaria: '#1e40af'
          },
          plano: tenant.assinatura?.plano || 'gratuito'
        }
      });

    } catch (error) {
      console.error('Erro ao buscar tenant por domínio:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar informações do tenant'
      });
    }
  }

  /**
   * GET /public/tenant/:id
   * Retorna dados públicos do tenant por ID
   */
  async getTenantById(req, res) {
    try {
      const { id } = req.params;

      const tenant = await TenantService.findById(id);

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'Tenant não encontrado'
        });
      }

      // Valida se subscription está ativa
      if (!tenant.assinatura?.ativa) {
        return res.status(403).json({
          success: false,
          error: 'Assinatura inativa'
        });
      }

      // Retorna dados públicos
      return res.status(200).json({
        success: true,
        tenant: {
          id: tenant._id,
          nome: tenant.provedor.nome,
          razao_social: tenant.provedor.razao_social,
          cnpj: tenant.provedor.cnpj,
          email: tenant.provedor.email,
          telefone: tenant.provedor.telefone,
          dominio: tenant.provedor.dominio,
          website: tenant.provedor.website || null,
          logo: tenant.provedor.logo || null,
          cores: tenant.provedor.cores || {
            primaria: '#2563eb',
            secundaria: '#1e40af'
          },
          plano: tenant.assinatura?.plano || 'gratuito'
        }
      });

    } catch (error) {
      console.error('Erro ao buscar tenant por ID:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar informações do tenant'
      });
    }
  }

  /**
   * GET /public/tenants/search
   * Busca tenants por domínio (para redirecionamento automático)
   * 
   * Query params:
   * - dominio: string
   * - host: string (hostname automático)
   */
  async searchTenant(req, res) {
    try {
      let { dominio, host } = req.query;

      // Se não informou domínio, usa o hostname da requisição
      if (!dominio && host) {
        // Remove porta e www
        dominio = host.replace(':.*', '').replace('www.', '');
      }

      if (!dominio) {
        return res.status(400).json({
          success: false,
          error: 'Domínio ou host é obrigatório'
        });
      }

      const tenant = await TenantService.findByDomain(dominio);

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'Tenant não encontrado',
          dominio
        });
      }

      if (!tenant.assinatura?.ativa) {
        return res.status(403).json({
          success: false,
          error: 'Assinatura inativa',
          dominio
        });
      }

      return res.status(200).json({
        success: true,
        tenant: {
          id: tenant._id,
          nome: tenant.provedor.nome,
          dominio: tenant.provedor.dominio
        }
      });

    } catch (error) {
      console.error('Erro ao buscar tenant:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar informações do tenant'
      });
    }
  }

  /**
   * GET /public/config
   * Retorna configuração do cliente baseado no tenant_id da query
   */
  async getConfig(req, res) {
    try {
      const { tenant_id, dominio } = req.query;

      let tenant;

      if (tenant_id) {
        tenant = await TenantService.findById(tenant_id);
      } else if (dominio) {
        tenant = await TenantService.findByDomain(dominio);
      } else {
        return res.status(400).json({
          success: false,
          error: 'tenant_id ou dominio é obrigatório'
        });
      }

      if (!tenant || !tenant.assinatura?.ativa) {
        return res.status(404).json({
          success: false,
          error: 'Tenant não encontrado ou inativo'
        });
      }

      // Configuração da interface pública
      return res.status(200).json({
        success: true,
        config: {
          tenant: {
            id: tenant._id,
            nome: tenant.provedor.nome,
            logo: tenant.provedor.logo,
            cores: tenant.provedor.cores || {
              primaria: '#2563eb',
              secundaria: '#1e40af',
              sucesso: '#10b981',
              erro: '#ef4444'
            }
          },
          api: {
            baseUrl: process.env.API_BASE_URL || 'http://localhost:3335',
            endpoints: {
              login: '/login',
              refresh: '/refresh',
              logout: '/logout',
              validate: '/validate',
              me: '/me'
            }
          },
          features: {
            loginSocial: false,
            recuperarSenha: true,
            criarConta: false
          }
        }
      });

    } catch (error) {
      console.error('Erro ao buscar configuração:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar configuração'
      });
    }
  }
}

module.exports = new PublicController();
