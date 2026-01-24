/**
 * IntegrationService.js
 * Serviço para gerenciar integrações
 */

const Integration = require('../schemas/Integration')

class IntegrationService {
  /**
   * Buscar integração por tenant e tipo
   */
  static async findByTenantAndType(tenant_id, type) {
    return await Integration.findOne({ tenant_id, type })
  }
  
  /**
   * Buscar todas as integrações de um tenant
   */
  static async findByTenant(tenant_id) {
    return await Integration.find({ tenant_id })
  }
  
  /**
   * Criar ou atualizar integração
   * Usa merge de campos para não perder dados existentes
   */
  static async upsert(tenant_id, type, data) {
    try {
      // Buscar documento existente
      const existing = await Integration.findOne({ tenant_id, type })
      
      if (existing) {
        // Se existe, fazer merge dos campos do subdocumento
        const merged = { ...existing[type], ...data }
        existing[type] = merged
        existing.updated_at = new Date()
        return await existing.save()
      } else {
        // Se não existe, criar novo documento
        const newIntegration = new Integration({
          tenant_id,
          type,
          [type]: data,
          updated_at: new Date()
        })
        return await newIntegration.save()
      }
    } catch (error) {
      console.error('[IntegrationService.upsert] Erro:', error)
      throw error
    }
  }
  
  /**
   * Atualizar integração específica
   */
  static async update(integration_id, data) {
    return await Integration.findByIdAndUpdate(
      integration_id,
      { ...data, updated_at: new Date() },
      { new: true }
    )
  }
  
  /**
   * Deletar integração
   */
  static async delete(integration_id) {
    return await Integration.findByIdAndDelete(integration_id)
  }
}

module.exports = IntegrationService
