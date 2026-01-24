const Subscription = require('../schemas/Subscription')
const Tenant = require('../schemas/Tenant')
const PlanService = require('./PlanService')
const logger = require('../../logger')

class SubscriptionService {
  /**
   * Criar nova assinatura
   */
  async create(data) {
    try {
      // Busca o tenant
      const tenant = await Tenant.findById(data.tenant_id)
      if (!tenant) {
        throw new Error('Tenant não encontrado')
      }

      // Busca informações do plano
      const plan = await PlanService.findBySlug(data.tenant_id, data.plan_slug)
      if (!plan) {
        throw new Error('Plano não encontrado')
      }

      // Calcula data de vencimento baseada no ciclo
      const dataVencimento = this.calcularDataVencimento(
        data.data_inicio || new Date(),
        data.ciclo_cobranca || plan.periodo
      )

      // Cria a assinatura
      const subscription = new Subscription({
        tenant_id: data.tenant_id,
        plan_slug: data.plan_slug || plan.slug,
        plan_name: plan.nome,
        valor_mensal: data.valor_mensal || plan.valor_mensal,
        data_inicio: data.data_inicio || new Date(),
        data_vencimento: dataVencimento,
        status: data.status || (plan.dias_trial > 0 ? 'trial' : 'ativa'),
        ciclo_cobranca: data.ciclo_cobranca || plan.periodo,
        is_trial: plan.dias_trial > 0,
        dias_trial_restantes: plan.dias_trial || 0,
        renovacao_automatica: data.renovacao_automatica !== false,
        observacoes: data.observacoes || ''
      })

      await subscription.save()

      // Atualiza o plano_atual do tenant
      tenant.plano_atual = plan.slug
      await tenant.save()

      logger.info(`Assinatura criada para tenant ${tenant.provedor.nome}`, {
        subscription_id: subscription._id,
        plan: plan.slug
      })

      return subscription
    } catch (error) {
      logger.error('Erro ao criar assinatura', { error: error.message })
      throw error
    }
  }

  /**
   * Buscar assinaturas de um tenant
   */
  async findByTenant(tenantId, filters = {}) {
    try {
      const query = { tenant_id: tenantId }

      if (filters.status) {
        query.status = filters.status
      }

      const subscriptions = await Subscription.find(query)
        .sort({ criado_em: -1 })

      return subscriptions
    } catch (error) {
      logger.error('Erro ao buscar assinaturas', { error: error.message })
      throw error
    }
  }

  /**
   * Buscar assinatura ativa de um tenant
   */
  async findActiveByTenant(tenantId) {
    try {
      const subscription = await Subscription.findOne({
        tenant_id: tenantId,
        status: { $in: ['ativa', 'trial'] }
      }).sort({ criado_em: -1 })

      return subscription
    } catch (error) {
      logger.error('Erro ao buscar assinatura ativa', { error: error.message })
      throw error
    }
  }

  /**
   * Atualizar assinatura
   */
  async update(subscriptionId, data) {
    try {
      const subscription = await Subscription.findById(subscriptionId)
      if (!subscription) {
        throw new Error('Assinatura não encontrada')
      }

      // Campos permitidos para atualização
      const allowedFields = [
        'valor_mensal',
        'data_vencimento',
        'status',
        'renovacao_automatica',
        'observacoes'
      ]

      allowedFields.forEach(field => {
        if (data[field] !== undefined) {
          subscription[field] = data[field]
        }
      })

      await subscription.save()

      logger.info(`Assinatura atualizada`, { subscription_id: subscriptionId })

      return subscription
    } catch (error) {
      logger.error('Erro ao atualizar assinatura', { error: error.message })
      throw error
    }
  }

  /**
   * Mudar status da assinatura
   */
  async changeStatus(subscriptionId, newStatus, motivo = '') {
    try {
      const subscription = await Subscription.findById(subscriptionId)
      if (!subscription) {
        throw new Error('Assinatura não encontrada')
      }

      const oldStatus = subscription.status

      switch (newStatus) {
        case 'cancelada':
          subscription.cancelar(motivo)
          break
        case 'suspensa':
          subscription.suspender()
          break
        case 'inadimplente':
          subscription.marcarInadimplente()
          break
        case 'ativa':
          subscription.reativar()
          break
        default:
          throw new Error(`Status inválido: ${newStatus}`)
      }

      await subscription.save()

      logger.info(`Status da assinatura alterado: ${oldStatus} -> ${newStatus}`, {
        subscription_id: subscriptionId,
        motivo
      })

      return subscription
    } catch (error) {
      logger.error('Erro ao mudar status da assinatura', { error: error.message })
      throw error
    }
  }

  /**
   * Renovar assinatura
   */
  async renovar(subscriptionId, meses = 1) {
    try {
      const subscription = await Subscription.findById(subscriptionId)
      if (!subscription) {
        throw new Error('Assinatura não encontrada')
      }

      subscription.renovar(meses)
      await subscription.save()

      logger.info(`Assinatura renovada por ${meses} mês(es)`, {
        subscription_id: subscriptionId
      })

      return subscription
    } catch (error) {
      logger.error('Erro ao renovar assinatura', { error: error.message })
      throw error
    }
  }

  /**
   * Registrar pagamento
   */
  async registrarPagamento(subscriptionId, pagamento) {
    try {
      const subscription = await Subscription.findById(subscriptionId)
      if (!subscription) {
        throw new Error('Assinatura não encontrada')
      }

      subscription.registrarPagamento(pagamento)
      await subscription.save()

      logger.info(`Pagamento registrado`, {
        subscription_id: subscriptionId,
        valor: pagamento.valor,
        status: pagamento.status
      })

      return subscription
    } catch (error) {
      logger.error('Erro ao registrar pagamento', { error: error.message })
      throw error
    }
  }

  /**
   * Mudar plano (upgrade/downgrade)
   */
  async changePlan(tenantId, newPlanSlug, imediato = true) {
    try {
      const tenant = await Tenant.findById(tenantId)
      if (!tenant) {
        throw new Error('Tenant não encontrado')
      }

      const newPlan = await PlanService.findBySlug(tenantId, newPlanSlug)
      if (!newPlan) {
        throw new Error('Novo plano não encontrado')
      }

      // Busca assinatura atual
      const currentSubscription = await this.findActiveByTenant(tenantId)

      if (imediato && currentSubscription) {
        // Cancela a assinatura atual
        currentSubscription.cancelar('Mudança de plano')
        await currentSubscription.save()
      }

      // Cria nova assinatura
      const newSubscription = await this.create({
        tenant_id: tenantId,
        plan_slug: newPlanSlug,
        subscription_anterior_id: currentSubscription?._id || null
      })

      logger.info(`Plano alterado de ${currentSubscription?.plan_slug} para ${newPlanSlug}`, {
        tenant_id: tenantId
      })

      return newSubscription
    } catch (error) {
      logger.error('Erro ao mudar plano', { error: error.message })
      throw error
    }
  }

  /**
   * Histórico de planos de um tenant
   */
  async getPlanHistory(tenantId) {
    try {
      const subscriptions = await Subscription.find({ tenant_id: tenantId })
        .sort({ criado_em: 1 })
        .select('plan_slug plan_name data_inicio data_vencimento status criado_em')

      return subscriptions
    } catch (error) {
      logger.error('Erro ao buscar histórico de planos', { error: error.message })
      throw error
    }
  }

  /**
   * Métricas de receita
   */
  async getRevenueMetrics(filters = {}) {
    try {
      const matchStage = {}

      if (filters.status) {
        matchStage.status = filters.status
      }

      if (filters.startDate || filters.endDate) {
        matchStage.data_inicio = {}
        if (filters.startDate) {
          matchStage.data_inicio.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          matchStage.data_inicio.$lte = new Date(filters.endDate)
        }
      }

      const metrics = await Subscription.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total_subscriptions: { $sum: 1 },
            mrr: { $sum: '$valor_mensal' }, // Monthly Recurring Revenue
            avg_value: { $avg: '$valor_mensal' },
            active_count: {
              $sum: { $cond: [{ $in: ['$status', ['ativa', 'trial']] }, 1, 0] }
            },
            cancelled_count: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelada'] }, 1, 0] }
            },
            suspended_count: {
              $sum: { $cond: [{ $eq: ['$status', 'suspensa'] }, 1, 0] }
            },
            overdue_count: {
              $sum: { $cond: [{ $eq: ['$status', 'inadimplente'] }, 1, 0] }
            }
          }
        }
      ])

      if (metrics.length === 0) {
        return {
          total_subscriptions: 0,
          mrr: 0,
          avg_value: 0,
          active_count: 0,
          cancelled_count: 0,
          suspended_count: 0,
          overdue_count: 0
        }
      }

      return metrics[0]
    } catch (error) {
      logger.error('Erro ao calcular métricas de receita', { error: error.message })
      throw error
    }
  }

  /**
   * Calcular data de vencimento baseada no ciclo
   */
  calcularDataVencimento(dataInicio, ciclo) {
    const data = new Date(dataInicio)

    switch (ciclo) {
      case 'mensal':
        data.setMonth(data.getMonth() + 1)
        break
      case 'trimestral':
        data.setMonth(data.getMonth() + 3)
        break
      case 'semestral':
        data.setMonth(data.getMonth() + 6)
        break
      case 'anual':
        data.setFullYear(data.getFullYear() + 1)
        break
      case 'vitalicio':
        data.setFullYear(data.getFullYear() + 100) // 100 anos no futuro
        break
      default:
        data.setMonth(data.getMonth() + 1)
    }

    return data
  }

  /**
   * Verificar assinaturas vencidas e marcar como inadimplentes
   */
  async checkExpiredSubscriptions() {
    try {
      const now = new Date()

      const expiredSubscriptions = await Subscription.find({
        status: 'ativa',
        ciclo_cobranca: { $ne: 'vitalicio' },
        data_vencimento: { $lt: now }
      })

      let count = 0
      for (const subscription of expiredSubscriptions) {
        subscription.marcarInadimplente()
        await subscription.save()
        count++
      }

      if (count > 0) {
        logger.info(`${count} assinatura(s) marcada(s) como inadimplente`)
      }

      return count
    } catch (error) {
      logger.error('Erro ao verificar assinaturas vencidas', { error: error.message })
      throw error
    }
  }
}

module.exports = new SubscriptionService()
