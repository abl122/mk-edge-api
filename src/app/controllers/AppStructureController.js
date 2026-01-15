/**
 * AppStructureController - Estrutura e Configurações do App
 * 
 * Implementa consultas relacionadas à estrutura do aplicativo,
 * campos personalizados e configurações
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

class AppStructureController {
  /**
   * Retorna campos personalizados do formulário
   * GET /app/form-fields
   */
  async formFields(req, res) {
    try {
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca campos do formulário via agente
      const campos = await MkAuthAgentService.execute(
        tenant,
        'camposFormulario'
      );
      
      logger.info(`[AppStructureController] ${campos.length} campos do formulário`, {
        provedor_id: tenant._id
      });
      
      return res.json(campos);
      
    } catch (error) {
      logger.error('[AppStructureController] Erro ao buscar campos', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar campos do formulário',
        message: error.message
      });
    }
  }
  
  /**
   * Retorna configurações do sistema
   * GET /app/settings
   */
  async settings(req, res) {
    try {
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca configurações via agente
      const configuracoes = await MkAuthAgentService.execute(
        tenant,
        'configuracoesSistema'
      );
      
      logger.info(`[AppStructureController] ${configuracoes.length} configurações`, {
        provedor_id: tenant._id
      });
      
      return res.json(configuracoes);
      
    } catch (error) {
      logger.error('[AppStructureController] Erro ao buscar configurações', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar configurações',
        message: error.message
      });
    }
  }
  
  /**
   * Retorna planos disponíveis
   * GET /app/plans
   */
  async plans(req, res) {
    try {
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca planos ativos via agente
      const planos = await MkAuthAgentService.execute(
        tenant,
        'planosAtivos'
      );
      
      logger.info(`[AppStructureController] ${planos.length} planos disponíveis`, {
        provedor_id: tenant._id
      });
      
      return res.json(planos);
      
    } catch (error) {
      logger.error('[AppStructureController] Erro ao buscar planos', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar planos',
        message: error.message
      });
    }
  }
  
  /**
   * Retorna informações do provedor/tenant
   * GET /app/provider-info
   */
  async providerInfo(req, res) {
    try {
      const { tenant } = req;
      
      // Retorna informações públicas do provedor
      const info = {
        nome: tenant.nome_provedor,
        dominio: tenant.dominio,
        logo: tenant.logo_url,
        cores: tenant.configuracoes?.cores || {},
        contato: {
          telefone: tenant.telefone_suporte,
          email: tenant.email_suporte,
          whatsapp: tenant.whatsapp_suporte
        },
        features: {
          agente_ativo: tenant.usaAgente(),
          portal_ativo: tenant.portal_ativo,
          app_ativo: tenant.app_ativo
        }
      };
      
      logger.info('[AppStructureController] Informações do provedor', {
        provedor_id: tenant._id
      });
      
      return res.json(info);
      
    } catch (error) {
      logger.error('[AppStructureController] Erro ao buscar info do provedor', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar informações do provedor',
        message: error.message
      });
    }
  }
}

module.exports = new AppStructureController();
