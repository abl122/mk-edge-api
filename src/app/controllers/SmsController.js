/**
 * SmsController.js
 * Integração com SMS Gateway local
 * 
 * Funcionalidades:
 * - Salvar credenciais (URL, Usuário, Senha)
 * - Testar conexão com SMS Gateway
 */

const axios = require('axios')
const logger = require('../../logger')
const { formatPhoneForSMS } = require('../utils/phone')

class SmsController {
  /**
   * GET /api/integrations/sms/config
   * Buscar configuração do SMS Gateway
   */
  async getConfig(req, res) {
    try {
      const { tenant } = req
      const IntegrationService = require('../services/IntegrationService')

      if (!tenant) {
        return res.json({
          success: true,
          config: {
            enabled: false,
            url: '',
            user: '',
            updated_at: null
          }
        })
      }

      const integration = await IntegrationService.findByTenantAndType(tenant._id, 'sms')

      const config = {
        enabled: integration?.sms?.enabled || false,
        endpoint: integration?.sms?.endpoint || integration?.sms?.url || '',
        username: integration?.sms?.username || integration?.sms?.user || '',
        password: integration?.sms?.password || '',
        token: integration?.sms?.token || '',
        method: integration?.sms?.method || 'POST',
        default_sender: integration?.sms?.default_sender || 'MK-Edge',
        updated_at: integration?.updated_at || null,
        has_password: !!integration?.sms?.password
      }

      logger.info('SMS configuração carregada', {
        tenant: tenant?.nome || tenant?._id,
        enabled: !!config.enabled,
        endpoint: config.endpoint ? '***' + config.endpoint.slice(-6) : '',
        updated_at: config.updated_at
      })

      res.json({
        success: true,
        config
      })
    } catch (error) {
      logger.error('Erro ao buscar config SMS:', error.message)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar configuração'
      })
    }
  }

  /**
   * POST /api/integrations/sms/config
   * Salvar/Atualizar configuração do SMS Gateway
   */
  async updateConfig(req, res) {
    try {
      const { tenant } = req
      const { endpoint, url, username, user, password, enabled, token, default_sender, method } = req.body
      const IntegrationService = require('../services/IntegrationService')

      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant não encontrado para salvar configuração'
        })
      }

      // Buscar configuração atual para preservar senha/token se não vierem no payload
      const current = await IntegrationService.findByTenantAndType(tenant._id, 'sms')

      // Construir dados do SMS
      const smsData = {
        enabled: enabled !== false,
        endpoint: (endpoint || url || '').trim(),
        url: (url || endpoint || '').trim(),
        username: (username || user || '').trim(),
        user: (user || username || '').trim(),
        token: (token !== undefined ? token : current?.sms?.token || '').trim(),
        method: method || current?.sms?.method || 'POST',
        default_sender: (default_sender || 'MK-Edge').trim()
      }

      // Preservar password se não foi fornecida
      if (password !== undefined && password !== '') {
        smsData.password = password.trim()
      } else if (current?.sms?.password) {
        smsData.password = current.sms.password
      }

      const integration = await IntegrationService.upsert(tenant._id, 'sms', smsData)

      logger.info('Configuração SMS atualizada', {
        tenant: tenant?.nome || tenant?._id,
        enabled: !!integration.sms?.enabled,
        endpoint: (integration.sms?.endpoint || integration.sms?.url) ? '***' + (integration.sms?.endpoint || integration.sms?.url).slice(-6) : '',
        username_set: !!(integration.sms?.username || integration.sms?.user),
        token_set: !!integration.sms?.token
      })

      res.json({
        success: true,
        message: 'Configuração salva com sucesso',
        config: {
          enabled: integration.sms?.enabled || false,
          endpoint: integration.sms?.endpoint || integration.sms?.url || '',
          username: integration.sms?.username || integration.sms?.user || '',
          password: integration.sms?.password || '',
          token: integration.sms?.token || '',
          default_sender: integration.sms?.default_sender || 'MK-Edge',
          updated_at: integration.updated_at || null,
          has_password: !!integration.sms?.password
        }
      })
    } catch (error) {
      logger.error('Erro ao salvar config SMS:', error.message)
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar configuração'
      })
    }
  }

  /**
   * POST /api/integrations/sms/test
   * Testar conexão com SMS Gateway
   */
  async testConnection(req, res) {
    try {
      const { tenant } = req
      const { endpoint, url, user, username, password, token } = req.body
      const IntegrationService = require('../services/IntegrationService')

      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant não encontrado para testar conexão'
        })
      }
      
      const saved = await IntegrationService.findByTenantAndType(tenant._id, 'sms')

      const smsUrl = endpoint || url || saved?.sms?.endpoint || saved?.sms?.url
      const smsUser = username || user || saved?.sms?.username || saved?.sms?.user
      // Token é o parâmetro 'p' esperado pelo servidor (a senha de autenticação)
      const smsToken = token || saved?.sms?.token
      const smsMethod = saved?.sms?.method || 'POST'

      if (!smsUrl || !smsUser || !smsToken) {
        logger.warn('Teste SMS cancelado: dados ausentes', {
          tenant: tenant?.nome || tenant?._id,
          endpoint_set: !!smsUrl,
          user_set: !!smsUser,
          token_set: !!smsToken
        })
        return res.status(400).json({
          success: false,
          message: 'Configure os dados de conexão SMS antes de testar.'
        })
      }

      logger.info('Testando conexão SMS Gateway', {
        tenant: tenant?.nome || tenant?._id,
        endpoint: smsUrl ? '***' + smsUrl.slice(-6) : '',
        method: smsMethod
      })

      try {
        // Enviar SMS de teste com parâmetros esperados pelo servidor
        const paramsObj = {
          p: smsToken,  // token é o parâmetro 'p' esperado pelo servidor
          u: smsUser,   // usuário (opcional)
          to: '5500000000000',
          msg: 'Teste de conexao MK Edge'
        }

        const params = new URLSearchParams(paramsObj)

        let response
        if (smsMethod === 'GET') {
          // GET: parâmetros na URL
          response = await axios.get(`${smsUrl}?${params.toString()}`, {
            timeout: 10000,
            validateStatus: (status) => status < 500
          })
        } else {
          // POST: parâmetros no corpo
          response = await axios.post(smsUrl, params.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000,
            validateStatus: (status) => status < 500
          })
        }

        // Interpretação dos status HTTP:
        // 200: OK - Qualquer resposta (sucesso ou erro)
        // 401: Token não fornecido
        // 403: Token inválido
        let isSuccess = false
        let message = 'Erro ao conectar com SMS Gateway'
        
        if (response.status === 401) {
          isSuccess = false
          message = 'Token de autenticação não fornecido'
        } else if (response.status === 403) {
          isSuccess = false
          message = 'Token de autenticação inválido'
        } else if (response.status === 200) {
          // Status 200 - resposta pode conter sucesso ou erro no corpo
          // O gateway pode retornar JSON ou HTML
          if (typeof response.data === 'object' && response.data !== null) {
            // É JSON
            if (response.data.success === true) {
              isSuccess = true
              message = 'Conexão estabelecida com sucesso! SMS Gateway está funcionando.'
            } else if (response.data.success === false) {
              isSuccess = false
              message = response.data.message || response.data.error || 'Falha ao conectar com SMS Gateway'
            } else {
              // Objeto mas sem success field - assumir sucesso
              isSuccess = true
              message = 'Servidor SMS está acessível e respondendo.'
            }
          } else {
            // Retorna HTML ou texto (provável sucesso)
            isSuccess = true
            message = 'Servidor SMS está acessível.'
          }
        } else {
          // Outro status HTTP
          isSuccess = false
          message = `Erro HTTP ${response.status}: ${response.statusText || 'Erro desconhecido'}`
        }

        logger.info('Teste de conexão SMS completo', {
          tenant: tenant.nome,
          status: response.status,
          success: isSuccess,
          message: message,
          responseType: typeof response.data
        })

        return res.json({
          success: true,
          connected: isSuccess,
          message: message,
          data: response.data
        })
      } catch (error) {
        const gatewayMessage = error.response?.data?.message || error.response?.data?.error || error.message

        logger.warn('Falha ao testar SMS Gateway', {
          tenant: tenant.nome,
          status: error.response?.status,
          message: gatewayMessage
        })

        // Se falhou no health check, servidor inacessível
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          return res.status(400).json({
            success: false,
            connected: false,
            message: 'Servidor SMS inacessível. Verifique o endpoint.',
            error: gatewayMessage
          })
        }

        return res.status(400).json({
          success: false,
          connected: false,
          message: 'Falha ao conectar com SMS Gateway. Verifique as credenciais.',
          error: gatewayMessage
        })
      }
    } catch (error) {
      logger.error('Erro ao testar SMS Gateway:', error.message)
      return res.status(500).json({
        success: false,
        message: 'Erro ao testar conexão',
        error: error.message
      })
    }
  }

  /**
   * POST /api/integrations/sms/send
   * Enviar SMS para um número
   */
  async sendSms(req, res) {
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
      const integration = await IntegrationService.findByTenantAndType(tenant._id, 'sms')
      
      if (!integration?.sms?.enabled) {
        return res.status(400).json({
          success: false,
          message: 'SMS não está configurado ou habilitado'
        })
      }

      const { endpoint, url, username, user, password, token, method } = integration.sms
      const smsUrl = endpoint || url
      const smsUser = username || user
      // Prefer explicit password; keep token separately for gateways that need both
      const smsPassword = password || token
      const smsToken = token
      const smsMethod = method || 'POST'

      if (!smsUrl || !smsUser || !smsPassword) {
        return res.status(400).json({
          success: false,
          message: 'Configuração SMS incompleta'
        })
      }

      // Formatar telefone para SMS (92991424261)
      let phoneFormatted
      try {
        phoneFormatted = formatPhoneForSMS(telefone)
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Número de telefone inválido',
          error: error.message
        })
      }

      logger.info('Enviando SMS', {
        tenant: tenant.nome,
        telefone_original: telefone,
        telefone_formatado: phoneFormatted,
        sms_endpoint: smsUrl
      })

      // Construir parâmetros para SMS Gateway (formato esperado pelo servidor)
      const paramsObj = {
        u: smsUser,               // login/usuário
        p: smsPassword,           // password/token (obrigatório)
        to: `55${phoneFormatted}`, // número com código do país
        msg: mensagem             // mensagem
      }

      // Token opcional no parâmetro "h" quando fornecido
      if (smsToken) {
        paramsObj.h = smsToken
      }

      const params = new URLSearchParams(paramsObj)

      logger.info('Enviando SMS com parâmetros', {
        url: smsUrl,
        method: smsMethod,
        usuario: smsUser,
        telefone: `55${phoneFormatted}`,
        mensagem: mensagem.substring(0, 50) + '...'
      })

      let response
      if (smsMethod === 'GET') {
        // GET: parâmetros na URL
        response = await axios.get(`${smsUrl}?${params.toString()}`, {
          timeout: 10000
        })
      } else {
        // POST: parâmetros no corpo
        response = await axios.post(smsUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        })
      }

      logger.info('SMS enviado com sucesso', { response: response.data })

      return res.json({
        success: true,
        message: 'SMS enviado com sucesso',
        telefone_formatado: phoneFormatted,
        response: response.data
      })
    } catch (error) {
      logger.error('Erro ao enviar SMS:', error.message)
      return res.status(500).json({
        success: false,
        message: 'Erro ao enviar SMS',
        error: error.message
      })
    }
  }
}

module.exports = new SmsController()
