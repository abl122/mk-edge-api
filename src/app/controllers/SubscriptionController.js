const SubscriptionService = require('../services/SubscriptionService')
const logger = require('../../logger')

class SubscriptionController {
  /**
   * Listar assinaturas
   * GET /api/admin/subscriptions?tenant_id=xxx&status=ativa
   */
  async index(req, res) {
    try {
      const { tenant_id, status } = req.query

      if (!tenant_id) {
        return res.status(400).json({
          success: false,
          message: 'tenant_id é obrigatório'
        })
      }

      const subscriptions = await SubscriptionService.findByTenant(tenant_id, { status })

      return res.json({
        success: true,
        subscriptions,
        total: subscriptions.length
      })
    } catch (error) {
      logger.error('Erro ao listar assinaturas', { error: error.message })
      return res.status(500).json({
        success: false,
        message: 'Erro ao listar assinaturas',
        error: error.message
      })
    }
  }

  /**
   * Buscar assinatura ativa de um tenant
   * GET /api/admin/subscriptions/active/:tenantId
   */
  async getActive(req, res) {
    try {
      const { tenantId } = req.params

      const subscription = await SubscriptionService.findActiveByTenant(tenantId)

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Nenhuma assinatura ativa encontrada'
        })
      }

      return res.json({
        success: true,
        subscription
      })
    } catch (error) {
      logger.error('Erro ao buscar assinatura ativa', { error: error.message })
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar assinatura ativa',
        error: error.message
      })
    }
  }

  /**
   * Criar nova assinatura
   * POST /api/admin/subscriptions
   */
  async store(req, res) {
    try {
      const {
        tenant_id,
        plan_slug,
        valor_mensal,
        data_inicio,
        ciclo_cobranca,
        status,
        observacoes
      } = req.body

      if (!tenant_id || !plan_slug) {
        return res.status(400).json({
          success: false,
          message: 'tenant_id e plan_slug são obrigatórios'
        })
      }

      const subscription = await SubscriptionService.create({
        tenant_id,
        plan_slug,
        valor_mensal,
        data_inicio,
        ciclo_cobranca,
        status,
        observacoes
      })

      return res.status(201).json({
        success: true,
        message: 'Assinatura criada com sucesso',
        subscription
      })
    } catch (error) {
      logger.error('Erro ao criar assinatura', { error: error.message })
      return res.status(500).json({
        success: false,
        message: error.message || 'Erro ao criar assinatura'
      })
    }
  }

  /**
   * Atualizar assinatura
   * PUT /api/admin/subscriptions/:id
   */
  async update(req, res) {
    try {
      const { id } = req.params
      const data = req.body

      const subscription = await SubscriptionService.update(id, data)

      return res.json({
        success: true,
        message: 'Assinatura atualizada com sucesso',
        subscription
      })
    } catch (error) {
      logger.error('Erro ao atualizar assinatura', { error: error.message })
      return res.status(500).json({
        success: false,
        message: error.message || 'Erro ao atualizar assinatura'
      })
    }
  }

  /**
   * Mudar status da assinatura
   * PATCH /api/admin/subscriptions/:id/status
   */
  async changeStatus(req, res) {
    try {
      const { id } = req.params
      const { status, motivo } = req.body

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status é obrigatório'
        })
      }

      const subscription = await SubscriptionService.changeStatus(id, status, motivo)

      return res.json({
        success: true,
        message: 'Status alterado com sucesso',
        subscription
      })
    } catch (error) {
      logger.error('Erro ao mudar status', { error: error.message })
      return res.status(500).json({
        success: false,
        message: error.message || 'Erro ao mudar status'
      })
    }
  }

  /**
   * Renovar assinatura
   * POST /api/admin/subscriptions/:id/renovar
   */
  async renovar(req, res) {
    try {
      const { id } = req.params
      const { meses = 1 } = req.body

      const subscription = await SubscriptionService.renovar(id, meses)

      return res.json({
        success: true,
        message: `Assinatura renovada por ${meses} mês(es)`,
        subscription
      })
    } catch (error) {
      logger.error('Erro ao renovar assinatura', { error: error.message })
      return res.status(500).json({
        success: false,
        message: error.message || 'Erro ao renovar assinatura'
      })
    }
  }

  /**
   * Registrar pagamento
   * POST /api/admin/subscriptions/:id/pagamentos
   */
  async registrarPagamento(req, res) {
    try {
      const { id } = req.params
      const pagamento = req.body

      if (!pagamento.valor || !pagamento.metodo) {
        return res.status(400).json({
          success: false,
          message: 'Valor e método de pagamento são obrigatórios'
        })
      }

      pagamento.data_pagamento = pagamento.data_pagamento || new Date()
      pagamento.status = pagamento.status || 'confirmado'

      const subscription = await SubscriptionService.registrarPagamento(id, pagamento)

      return res.json({
        success: true,
        message: 'Pagamento registrado com sucesso',
        subscription
      })
    } catch (error) {
      logger.error('Erro ao registrar pagamento', { error: error.message })
      return res.status(500).json({
        success: false,
        message: error.message || 'Erro ao registrar pagamento'
      })
    }
  }

  /**
   * Mudar plano
   * POST /api/admin/subscriptions/:tenantId/change-plan
   */
  async changePlan(req, res) {
    try {
      const { tenantId } = req.params
      const { new_plan_slug, imediato = true } = req.body

      if (!new_plan_slug) {
        return res.status(400).json({
          success: false,
          message: 'new_plan_slug é obrigatório'
        })
      }

      const subscription = await SubscriptionService.changePlan(
        tenantId,
        new_plan_slug,
        imediato
      )

      return res.json({
        success: true,
        message: 'Plano alterado com sucesso',
        subscription
      })
    } catch (error) {
      logger.error('Erro ao mudar plano', { error: error.message })
      return res.status(500).json({
        success: false,
        message: error.message || 'Erro ao mudar plano'
      })
    }
  }

  /**
   * Histórico de planos
   * GET /api/admin/subscriptions/history/:tenantId
   */
  async history(req, res) {
    try {
      const { tenantId } = req.params

      const history = await SubscriptionService.getPlanHistory(tenantId)

      return res.json({
        success: true,
        history,
        total: history.length
      })
    } catch (error) {
      logger.error('Erro ao buscar histórico', { error: error.message })
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar histórico de planos',
        error: error.message
      })
    }
  }

  /**
   * Métricas de receita
   * GET /api/admin/subscriptions/metrics
   */
  async metrics(req, res) {
    try {
      const { status, start_date, end_date } = req.query

      const metrics = await SubscriptionService.getRevenueMetrics({
        status,
        startDate: start_date,
        endDate: end_date
      })

      return res.json({
        success: true,
        metrics
      })
    } catch (error) {
      logger.error('Erro ao buscar métricas', { error: error.message })
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar métricas',
        error: error.message
      })
    }
  }
}

module.exports = new SubscriptionController()
