const TenantService = require('../services/TenantService');
const logger = require('../../logger');

/**
 * TenantController - Gerenciamento de Tenants
 * 
 * CRUD de provedores (tenants) no sistema
 * Apenas administradores do sistema podem acessar
 */
class TenantController {
  
  /**
   * Lista todos os tenants
   * 
   * GET /tenants
   * Query params:
   * - page: número da página (default: 1)
   * - limit: itens por página (default: 10)
   * - ativo: filtrar por atividade (true/false)
   * - agenteAtivo: filtrar se agente está ativo (true/false)
   * - nome: filtrar por nome (parcial)
   */
  async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const filters = {};

      if (req.query.ativo !== undefined) {
        filters.ativo = req.query.ativo === 'true';
      }

      if (req.query.agenteAtivo !== undefined) {
        filters.agenteAtivo = req.query.agenteAtivo === 'true';
      }

      if (req.query.nome) {
        filters.nome = req.query.nome;
      }

      const resultado = await TenantService.findAll(page, limit, filters);

      logger.info('Tenants listados', {
        total: resultado.total,
        page: resultado.page,
        limit: resultado.limit
      });

      return res.json({
        success: true,
        data: resultado.tenants,
        pagination: {
          total: resultado.total,
          pages: resultado.pages,
          page: resultado.page,
          limit: resultado.limit
        }
      });

    } catch (error) {
      logger.error('Erro ao listar tenants', {
        error: error.message
      });

      return res.status(500).json({
        error: 'Erro ao listar tenants'
      });
    }
  }

  /**
   * Busca um tenant por ID
   * 
   * GET /tenants/:id
   */
  async show(req, res) {
    try {
      const { id } = req.params;

      const tenant = await TenantService.findById(id);

      if (!tenant) {
        logger.warn('Tenant não encontrado', { tenant_id: id });
        return res.status(404).json({
          error: 'Tenant não encontrado'
        });
      }

      return res.json({
        success: true,
        data: tenant
      });

    } catch (error) {
      logger.error('Erro ao buscar tenant', {
        tenant_id: req.params.id,
        error: error.message
      });

      return res.status(500).json({
        error: 'Erro ao buscar tenant'
      });
    }
  }

  /**
   * Cria um novo tenant
   * 
   * POST /tenants
   * Body:
   * {
   *   "provedor": {
   *     "nome": "Provedor XYZ",
   *     "razao_social": "Provedor XYZ LTDA",
   *     "cnpj": "12.345.678/0001-90",
   *     "dominio": "provedor.com.br",
   *     "email": "admin@provedor.com.br",
   *     "telefone": "11 3000-0000"
   *   },
   *   "agente": {
   *     "url": "https://provedor.com.br/api.php",
   *     "token": "token-secreto-64-chars-minimo",
   *     "ativo": true
   *   },
   *   "assinatura": {
   *     "ativa": true,
   *     "plano": "profissional",
   *     "data_inicio": "2024-01-10",
   *     "data_fim": "2025-01-10",
   *     "valor_mensal": 500
   *   }
   * }
   */
  async store(req, res) {
    try {
      const data = req.body;

      // Validação básica
      if (!data.provedor?.nome || !data.provedor?.cnpj) {
        return res.status(400).json({
          error: 'Nome e CNPJ do provedor são obrigatórios'
        });
      }

      const tenant = await TenantService.create(data);

      logger.info('Tenant criado com sucesso', {
        tenant_id: tenant._id,
        nome: tenant.provedor?.nome
      });

      return res.status(201).json({
        success: true,
        data: tenant,
        message: 'Tenant criado com sucesso'
      });

    } catch (error) {
      logger.error('Erro ao criar tenant', {
        error: error.message
      });

      // Verifica se é erro de validação ou duplicação
      if (error.message.includes('CNPJ')) {
        return res.status(409).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro ao criar tenant'
      });
    }
  }

  /**
   * Atualiza um tenant
   * 
   * PUT /tenants/:id
   * Body: (mesma estrutura do POST, atualiza apenas campos fornecidos)
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const tenant = await TenantService.update(id, data);

      logger.info('Tenant atualizado com sucesso', {
        tenant_id: id,
        nome: tenant.provedor?.nome
      });

      return res.json({
        success: true,
        data: tenant,
        message: 'Tenant atualizado com sucesso'
      });

    } catch (error) {
      logger.error('Erro ao atualizar tenant', {
        tenant_id: req.params.id,
        error: error.message
      });

      if (error.message.includes('CNPJ')) {
        return res.status(409).json({
          error: error.message
        });
      }

      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro ao atualizar tenant'
      });
    }
  }

  /**
   * Deleta um tenant
   * 
   * DELETE /tenants/:id
   */
  async destroy(req, res) {
    try {
      const { id } = req.params;

      await TenantService.delete(id);

      logger.info('Tenant deletado com sucesso', {
        tenant_id: id
      });

      return res.json({
        success: true,
        message: 'Tenant deletado com sucesso'
      });

    } catch (error) {
      logger.error('Erro ao deletar tenant', {
        tenant_id: req.params.id,
        error: error.message
      });

      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro ao deletar tenant'
      });
    }
  }

  /**
   * Atualiza configurações do agente de um tenant
   * 
   * PATCH /tenants/:id/agente
   * Body:
   * {
   *   "url": "https://novo.url/api.php",
   *   "token": "novo-token",
   *   "ativo": true,
   *   "config": {
   *     "timeout": 15000,
   *     "retry": true,
   *     "max_retries": 2
   *   }
   * }
   */
  async updateAgente(req, res) {
    try {
      const { id } = req.params;
      const config = req.body;

      const tenant = await TenantService.updateAgente(id, config);

      logger.info('Agente do tenant atualizado', {
        tenant_id: id,
        agente_ativo: tenant.agente?.ativo
      });

      return res.json({
        success: true,
        data: tenant,
        message: 'Configurações do agente atualizadas'
      });

    } catch (error) {
      logger.error('Erro ao atualizar agente', {
        tenant_id: req.params.id,
        error: error.message
      });

      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Erro ao atualizar configurações do agente'
      });
    }
  }

  /**
   * Valida conexão com agente (ping)
   * 
   * GET /tenants/:id/agente/ping
   */
  async pingAgente(req, res) {
    try {
      const { id } = req.params;

      const success = await TenantService.pingAgente(id);

      if (!success) {
        return res.status(503).json({
          success: false,
          message: 'Agente não responde ou não configurado'
        });
      }

      return res.json({
        success: true,
        message: 'Agente respondendo normalmente'
      });

    } catch (error) {
      logger.error('Erro ao verificar agente', {
        tenant_id: req.params.id,
        error: error.message
      });

      return res.status(500).json({
        error: 'Erro ao verificar agente'
      });
    }
  }
}

module.exports = TenantController;
