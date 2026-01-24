/**
 * ZApiController.js
 * Integração básica com Z-API (WhatsApp)
 * 
 * Funcionalidades:
 * - Salvar credenciais (Instance ID, Token, Security Token)
 * - Testar conexão com Z-API
 */

const axios = require('axios')
const logger = require('../../logger')
const { formatPhoneForZAPI } = require('../utils/phone')

const Z_API_BASE_URL = 'https://api.z-api.io/instances'

class ZApiController {
  /**
   * Obter configuração de Z-API
   * GET /api/integrations/zapi/config
   */
  async getConfig(req, res) {
    try {
      const { tenant } = req
      const IntegrationService = require('../services/IntegrationService')
      
      if (!tenant) {
        return res.json({
          success: true,
          config: {
            instanceId: '',
            instanceToken: '',
            securityToken: '',
            enabled: false,
            updated_at: null
          }
        });
      }
      
      // Buscar integração na collection separada
      const integration = await IntegrationService.findByTenantAndType(tenant._id, 'zapi')

      return res.json({
        success: true,
        config: {
          instanceId: integration?.zapi?.instanceId || '',
          instanceToken: integration?.zapi?.instanceToken || '',
          securityToken: integration?.zapi?.securityToken || '',
          enabled: integration?.zapi?.enabled || false,
          updated_at: integration?.updated_at
        }
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao obter configuração',
        error: error.message
      })
    }
  }

  /**
   * Atualizar configuração de Z-API
   * POST /api/integrations/zapi/config
   */
  async updateConfig(req, res) {
    try {
      const { tenant } = req
      const { instanceId, instanceToken, securityToken } = req.body
      const IntegrationService = require('../services/IntegrationService')

      // Sem validação obrigatória - é uma ferramenta de admin para configurar
      // Aceita dados parciais ou vazios
      
      // Salvar em collection separada
      const integration = await IntegrationService.upsert(tenant._id, 'zapi', {
        instanceId,
        instanceToken,
        securityToken,
        enabled: !!(instanceId && instanceToken && securityToken)
      })

      return res.json({
        success: true,
        message: 'Configuração Z-API atualizada com sucesso',
        config: {
          instanceId: integration.zapi?.instanceId ? integration.zapi.instanceId.substring(0, 10) + '...' : '',
          enabled: integration.zapi?.enabled || false,
          updated_at: integration.updated_at
        }
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao atualizar configuração',
        error: error.message
      })
    }
  }

  /**
   * Testar conexão com Z-API
   * POST /api/integrations/zapi/test
   */
  async testConnection(req, res) {
    try {
      const { tenant } = req
      const { instanceId, instanceToken, securityToken } = req.body
      const IntegrationService = require('../services/IntegrationService')
      
      // Buscar config salva
      const saved = await IntegrationService.findByTenantAndType(tenant._id, 'zapi')
      
      // Se os dados foram passados no body, usar esses; senão usar da config
      const zapiInstanceId = instanceId || saved?.zapi?.instanceId
      const zapiToken = instanceToken || saved?.zapi?.instanceToken
      const zapiSecurityToken = securityToken || saved?.zapi?.securityToken

      // Se faltar dados, retornar erro amigável sem testar
      if (!zapiInstanceId || !zapiToken || !zapiSecurityToken) {
        return res.status(400).json({
          success: false,
          message: 'Configure os dados de conexão Z-API antes de testar.'
        })
      }

      try {
        const response = await axios.get(
          `${Z_API_BASE_URL}/${zapiInstanceId}/token/${zapiToken}/status`,
          {
            headers: {
              'Client-Token': zapiSecurityToken
            }
          }
        )

        const connected = response.data?.connected === true

        return res.json({
          success: true,
          connected: connected,
          message: connected ? 'Conexão estabelecida com sucesso!' : 'Instância não está conectada',
          data: response.data
        })
      } catch (error) {
        return res.status(400).json({
          success: false,
          connected: false,
          message: 'Falha ao conectar com Z-API. Verifique as credenciais.',
          error: error.response?.data?.message || error.message
        })
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao testar conexão',
        error: error.message
      })
    }
  }

  /**
   * POST /api/integrations/zapi/send
   * Enviar mensagem WhatsApp via Z-API
   */
  async sendMessage(req, res) {
    try {
      const { tenant } = req
      const { telefone, mensagem } = req.body
      const IntegrationService = require('../services/IntegrationService')

      if (!telefone || !mensagem) {
        return res.status(400).json({
          success: false,
          message: 'Telefone e mensagem são obrigatórios'
        })
      }

      // Buscar configuração
      const integration = await IntegrationService.findByTenantAndType(tenant._id, 'zapi')
      
      if (!integration?.zapi?.enabled) {
        return res.status(400).json({
          success: false,
          message: 'Z-API não está configurado ou habilitado'
        })
      }

      const { instanceId, instanceToken, securityToken } = integration.zapi

      if (!instanceId || !instanceToken || !securityToken) {
        return res.status(400).json({
          success: false,
          message: 'Configuração Z-API incompleta'
        })
      }

      // Formatar telefone para Z-API (559291424261 - sem 9º dígito)
      let phoneFormatted
      try {
        phoneFormatted = formatPhoneForZAPI(telefone)
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Número de telefone inválido',
          error: error.message
        })
      }

      logger.info('Enviando WhatsApp via Z-API', {
        tenant: tenant.nome,
        telefone_original: telefone,
        telefone_formatado: phoneFormatted
      })

      // Enviar mensagem via Z-API
      const response = await axios.post(
        `${Z_API_BASE_URL}/${instanceId}/token/${instanceToken}/send-text`,
        {
          phone: phoneFormatted,
          message: mensagem
        },
        {
          headers: {
            'Client-Token': securityToken,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      )

      return res.json({
        success: true,
        message: 'Mensagem enviada com sucesso',
        telefone_formatado: phoneFormatted,
        response: response.data
      })
    } catch (error) {
      logger.error('Erro ao enviar WhatsApp:', error.message)
      return res.status(500).json({
        success: false,
        message: 'Erro ao enviar mensagem',
        error: error.response?.data || error.message
      })
    }
  }
}

module.exports = new ZApiController()

