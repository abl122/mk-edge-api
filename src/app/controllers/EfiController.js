/**
 * EfiController.js
 * Integração com EFI/Gerencianet (Pagamentos)
 * 
 * Funcionalidades:
 * - Salvar credenciais por ambiente (Homologação/Produção)
 * - Upload de certificados P12
 * - Testar conexão com EFI
 */

const axios = require('axios')
const https = require('https')
const fs = require('fs')
const path = require('path')
const logger = require('../../logger')
const Integration = require('../schemas/Integration')

class EfiController {
  /**
   * GET /api/integrations/efi/config
   * Buscar configuração da EFI
   */
  async getConfig(req, res) {
    try {
      const { tenant } = req
      const IntegrationService = require('../services/IntegrationService')

      if (!tenant) {
        return res.json({
          success: true,
          config: {
            sandbox: true,
            enabled: false,
            homologacao: {
              client_id: '',
              client_secret: '',
              pix_key: '',
              has_certificate: false
            },
            producao: {
              client_id: '',
              client_secret: '',
              pix_key: '',
              has_certificate: false
            },
            updated_at: null
          }
        })
      }

      const integration = await IntegrationService.findByTenantAndType(tenant._id, 'efi')

      const config = {
        sandbox: integration?.efi?.sandbox !== false,
        enabled: integration?.efi?.enabled || false,
        homologacao: {
          client_id: integration?.efi?.homologacao?.client_id || '',
          client_secret: integration?.efi?.homologacao?.client_secret || '',
          pix_key: integration?.efi?.homologacao?.pix_key || '',
          has_certificate: !!integration?.efi?.homologacao?.certificate_path,
          certificate_filename: integration?.efi?.homologacao?.certificate_path ? 
            path.basename(integration.efi.homologacao.certificate_path) : null
        },
        producao: {
          client_id: integration?.efi?.producao?.client_id || '',
          client_secret: integration?.efi?.producao?.client_secret || '',
          pix_key: integration?.efi?.producao?.pix_key || '',
          has_certificate: !!integration?.efi?.producao?.certificate_path,
          certificate_filename: integration?.efi?.producao?.certificate_path ? 
            path.basename(integration.efi.producao.certificate_path) : null
        },
        updated_at: integration?.updated_at || null
      }

      logger.info('EFI configuração carregada', {
        tenant: tenant?.nome || tenant?._id,
        enabled: config.enabled,
        sandbox: config.sandbox,
        homologacao_configured: !!(config.homologacao.client_id && config.homologacao.has_certificate),
        producao_configured: !!(config.producao.client_id && config.producao.has_certificate)
      })

      res.json({
        success: true,
        config
      })
    } catch (error) {
      logger.error('Erro ao buscar config EFI:', error.message)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar configuração'
      })
    }
  }

  /**
   * POST /api/integrations/efi/config
   * Salvar/Atualizar configuração da EFI
   */
  async updateConfig(req, res) {
    try {
      const { tenant } = req
      const { 
        sandbox, 
        enabled,
        homologacao_client_id,
        homologacao_client_secret,
        homologacao_pix_key,
        producao_client_id,
        producao_client_secret,
        producao_pix_key
      } = req.body
      const IntegrationService = require('../services/IntegrationService')

      // DEBUG: Log do payload recebido
      logger.debug('EFI updateConfig payload recebido', {
        sandbox,
        enabled,
        homologacao_client_id: homologacao_client_id ? 'SET' : 'EMPTY',
        homologacao_client_secret: homologacao_client_secret ? 'SET' : 'EMPTY',
        homologacao_pix_key: homologacao_pix_key ? 'SET' : 'EMPTY',
        producao_client_id: producao_client_id ? 'SET' : 'EMPTY',
        producao_client_secret: producao_client_secret ? 'SET' : 'EMPTY',
        producao_pix_key: producao_pix_key ? 'SET' : 'EMPTY'
      })

      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant não encontrado para salvar configuração'
        })
      }

      // Buscar configuração atual
      const current = await Integration.findOne({ tenant_id: tenant._id, type: 'efi' })

      // Construir dados do EFI mantendo certificados existentes
      const efiData = {
        sandbox: sandbox !== false,
        enabled: enabled !== false,
        homologacao: {
          client_id: homologacao_client_id?.trim() || current?.efi?.homologacao?.client_id || '',
          client_secret: homologacao_client_secret?.trim() || current?.efi?.homologacao?.client_secret || '',
          pix_key: homologacao_pix_key?.trim() || current?.efi?.homologacao?.pix_key || '',
          certificate_path: current?.efi?.homologacao?.certificate_path || null
        },
        producao: {
          client_id: producao_client_id?.trim() || current?.efi?.producao?.client_id || '',
          client_secret: producao_client_secret?.trim() || current?.efi?.producao?.client_secret || '',
          pix_key: producao_pix_key?.trim() || current?.efi?.producao?.pix_key || '',
          certificate_path: current?.efi?.producao?.certificate_path || null
        }
      }

      // Usar findOneAndUpdate diretamente para garantir estrutura correta
      const integration = await Integration.findOneAndUpdate(
        { tenant_id: tenant._id, type: 'efi' },
        {
          $set: {
            tenant_id: tenant._id,
            type: 'efi',
            efi: efiData,
            updated_at: new Date()
          }
        },
        { upsert: true, new: true }
      )

      logger.info('Configuração EFI atualizada', {
        tenant: tenant?.nome || tenant?._id,
        sandbox: integration.efi?.sandbox,
        enabled: integration.efi?.enabled,
        homologacao_configured: !!(integration.efi?.homologacao?.client_id && integration.efi?.homologacao?.certificate_path),
        producao_configured: !!(integration.efi?.producao?.client_id && integration.efi?.producao?.certificate_path)
      })

      res.json({
        success: true,
        message: 'Configuração salva com sucesso',
        config: {
          sandbox: integration.efi?.sandbox !== false,
          enabled: integration.efi?.enabled || false,
          homologacao: {
            client_id: integration.efi?.homologacao?.client_id || '',
            pix_key: integration.efi?.homologacao?.pix_key || '',
            has_certificate: !!integration.efi?.homologacao?.certificate_path,
            certificate_filename: integration.efi?.homologacao?.certificate_path ? 
              path.basename(integration.efi.homologacao.certificate_path) : null
          },
          producao: {
            client_id: integration.efi?.producao?.client_id || '',
            pix_key: integration.efi?.producao?.pix_key || '',
            has_certificate: !!integration.efi?.producao?.certificate_path,
            certificate_filename: integration.efi?.producao?.certificate_path ? 
              path.basename(integration.efi.producao.certificate_path) : null
          },
          updated_at: integration.updated_at || null
        }
      })
    } catch (error) {
      logger.error('Erro ao salvar config EFI:', error.message)
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar configuração'
      })
    }
  }

  /**
   * POST /api/integrations/efi/upload-certificate
   * Upload de certificado P12
   */
  async uploadCertificate(req, res) {
    try {
      const { tenant } = req
      const { environment } = req.body // 'homologacao' ou 'producao'
      const IntegrationService = require('../services/IntegrationService')

      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant não encontrado'
        })
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum arquivo foi enviado'
        })
      }

      if (!['homologacao', 'producao'].includes(environment)) {
        return res.status(400).json({
          success: false,
          message: 'Ambiente inválido. Use "homologacao" ou "producao"'
        })
      }

      // Buscar configuração atual
      const current = await Integration.findOne({ tenant_id: tenant._id, type: 'efi' })
      
      // Definir caminho do certificado - usa nome padrão global, não por tenant
      const certificatesDir = path.join(__dirname, '../../../certificates')
      const filename = `efi-${environment}.p12`
      const certificatePath = path.join(certificatesDir, filename)

      // Garantir que o diretório existe
      if (!fs.existsSync(certificatesDir)) {
        fs.mkdirSync(certificatesDir, { recursive: true })
      }

      // Remover certificado anterior se existir
      if (fs.existsSync(certificatePath)) {
        fs.unlinkSync(certificatePath)
        logger.info('Certificado anterior removido', { path: certificatePath })
      }

      // Mover arquivo para o diretório de certificados
      fs.writeFileSync(certificatePath, req.file.buffer)

      // Atualizar configuração no banco
      const efiData = {
        ...current?.efi,
        [environment]: {
          ...current?.efi?.[environment],
          certificate_path: certificatePath
        }
      }

      const integration = await IntegrationService.upsert(tenant._id, 'efi', efiData)

      logger.info('Certificado EFI enviado', {
        tenant: tenant.nome,
        environment,
        filename,
        size: req.file.size
      })

      res.json({
        success: true,
        message: `Certificado de ${environment} enviado com sucesso`,
        certificate: {
          filename,
          environment,
          uploaded_at: new Date()
        }
      })
    } catch (error) {
      logger.error('Erro ao fazer upload de certificado EFI:', error.message)
      res.status(500).json({
        success: false,
        message: 'Erro ao fazer upload do certificado'
      })
    }
  }

  /**
   * POST /api/integrations/efi/test
   * Testar conexão com EFI
   */
  async testConnection(req, res) {
    try {
      const { tenant } = req
      const IntegrationService = require('../services/IntegrationService')

      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant não encontrado para testar conexão'
        })
      }
      
      const integration = await IntegrationService.findByTenantAndType(tenant._id, 'efi')
      const isSandbox = integration?.efi?.sandbox !== false
      const environment = isSandbox ? 'homologacao' : 'producao'
      const envData = integration?.efi?.[environment]

      if (!envData?.client_id || !envData?.client_secret) {
        return res.status(400).json({
          success: false,
          message: `Configure o Client ID e Client Secret de ${environment} antes de testar.`
        })
      }

      if (!envData?.certificate_path || !fs.existsSync(envData.certificate_path)) {
        return res.status(400).json({
          success: false,
          message: `Faça upload do certificado de ${environment} antes de testar.`
        })
      }

      logger.info('Testando conexão EFI', {
        tenant: tenant.nome,
        environment,
        sandbox: isSandbox
      })

      try {
        const baseUrl = isSandbox 
          ? 'https://pix-h.api.efipay.com.br'
          : 'https://pix.api.efipay.com.br'

        const authString = Buffer.from(`${envData.client_id}:${envData.client_secret}`).toString('base64')
        
        // Criar agent HTTPS com o certificado
        const httpsAgent = new https.Agent({
          pfx: fs.readFileSync(envData.certificate_path),
          passphrase: ''
        })

        const response = await axios.post(
          `${baseUrl}/oauth/token`,
          { grant_type: 'client_credentials' },
          {
            headers: {
              'Authorization': `Basic ${authString}`,
              'Content-Type': 'application/json'
            },
            httpsAgent,
            timeout: 30000
          }
        )

        const authenticated = !!response.data?.access_token

        logger.info('Teste de conexão EFI bem-sucedido', {
          tenant: tenant.nome,
          authenticated,
          environment
        })

        return res.json({
          success: true,
          connected: authenticated,
          message: authenticated ? 'Conexão estabelecida com sucesso!' : 'Falha na autenticação',
          data: {
            authenticated,
            environment,
            sandbox: isSandbox,
            expires_in: response.data?.expires_in,
            scope: response.data?.scope
          }
        })
      } catch (error) {
        logger.warn('Falha ao testar EFI', {
          tenant: tenant.nome,
          environment,
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        })

        return res.status(400).json({
          success: false,
          connected: false,
          message: 'Falha ao conectar com EFI. Verifique as credenciais e o certificado.',
          error: error.response?.data?.error_description || error.response?.data?.error || error.message,
          status: error.response?.status,
          environment
        })
      }
    } catch (error) {
      logger.error('Erro ao testar EFI:', error.message)
      return res.status(500).json({
        success: false,
        message: 'Erro ao testar conexão',
        error: error.message
      })
    }
  }
}

module.exports = new EfiController()
