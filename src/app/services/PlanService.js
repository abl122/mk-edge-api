/**
 * PlanService.js
 * Serviço para gerenciar planos de assinatura
 */

const Plan = require('../schemas/Plan')

class PlanService {
  /**
   * Buscar plano por tenant e slug
   */
  static async findByTenantAndSlug(tenant_id, slug) {
    return await Plan.findOne({ tenant_id, slug })
  }
  
  /**
   * Buscar todos os planos de um tenant
   * @param {string} tenant_id - ID do tenant
   * @param {boolean} activeOnly - Se true, retorna apenas ativos
   */
  static async findByTenant(tenant_id, activeOnly = false) {
    const filter = { tenant_id };
    if (activeOnly) {
      filter.ativo = true;
    }
    return await Plan.find(filter).sort({ ordem: 1 });
  }
  
  /**
   * Buscar todos os planos de um tenant (incluindo inativos)
   */
  static async findByTenantAll(tenant_id) {
    return await Plan.find({ tenant_id })
      .sort({ ordem: 1 })
  }
  
  /**
   * Criar plano
   */
  static async create(tenant_id, data) {
    const plan = new Plan({
      tenant_id,
      ...data
    })
    return await plan.save()
  }
  
  /**
   * Atualizar plano
   */
  static async update(plan_id, data) {
    return await Plan.findByIdAndUpdate(
      plan_id,
      { ...data, updated_at: new Date() },
      { new: true }
    )
  }
  
  /**
   * Deletar plano
   */
  static async delete(plan_id) {
    return await Plan.findByIdAndDelete(plan_id)
  }
  
  /**
   * Buscar plano por ID
   */
  static async findById(plan_id) {
    return await Plan.findById(plan_id)
  }
}

module.exports = PlanService
