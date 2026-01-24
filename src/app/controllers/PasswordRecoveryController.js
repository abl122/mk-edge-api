/**
 * PasswordRecoveryController.js
 * Gerencia recuperação de senha
 */

const logger = require('../../logger')
const User = require('../schemas/User')

class PasswordRecoveryController {
  /**
   * GET /api/auth/password-recovery/contacts
   * Obter contatos mascarados para recuperação de senha
   */
  static async getContacts(req, res) {
    try {
      const { identifier } = req.query

      if (!identifier) {
        return res.status(400).json({
          success: false,
          message: 'Identifier (username ou CNPJ) é obrigatório'
        })
      }

      // Remove formatação do CNPJ/CPF
      const cleanIdentifier = identifier.replace(/[.\-\/]/g, '')

      // Procura na tabela users (por login ou email)
      let user = await User.findOne({
        $or: [
          { login: cleanIdentifier },  // CNPJ sem formatação
          { username: cleanIdentifier },
          { email: identifier }
        ]
      }).lean()

      if (!user) {
        logger.warn('Usuário não encontrado para recuperação de senha', {
          identifier,
          cleanIdentifier,
          regexPattern
        })
        // Não retorna erro específico por segurança
        return res.json({
          success: true,
          data: {
            emailMasked: '****',
            phoneMasked: '****',
            emailAvailable: false,
            phoneAvailable: false,
            smsEnabled: false,
            whatsappEnabled: false,
            emailEnabled: true
          }
        })
      }

      // Mascara email e telefone do usuário (tenta telefone ou celular)
      const mascaraEmail = user.email 
        ? user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') 
        : '****'
      const phone = user.telefone || user.celular
      const mascaraPhone = phone 
        ? phone.replace(/(.{2})(.*)(.{2})/, '$1***$3') 
        : '****'

      logger.info('Contatos de recuperação de senha obtidos', {
        identifier,
        found: true,
        hasEmail: !!user.email,
        hasPhone: !!phone
      })

      return res.json({
        success: true,
        data: {
          emailMasked: mascaraEmail,
          phoneMasked: mascaraPhone,
          emailAvailable: !!user.email,
          phoneAvailable: !!phone,
          smsEnabled: true,
          whatsappEnabled: true,
          emailEnabled: true
        }
      })
    } catch (error) {
      logger.error('Erro ao obter contatos para recuperação:', error)
      return res.status(500).json({
        success: false,
        message: 'Erro ao processar recuperação de senha'
      })
    }
  }

  /**
   * POST /api/auth/password-recovery/request-sms
   * Solicitar código via SMS
   */
  static async requestSmsRecovery(req, res) {
    try {
      const { cnpjOrUsername } = req.body

      if (!cnpjOrUsername) {
        return res.status(400).json({
          success: false,
          message: 'CNPJ ou username é obrigatório'
        })
      }

      // Buscar usuário (admin ou portal)
      const User = require('../schemas/User')
      
      // Normalizar CNPJ (remover pontuação)
      const cleanIdentifier = cnpjOrUsername.replace(/[.\-\/]/g, '')
      
      // Admin usa username/login, Portal usa CNPJ sem formatação
      const user = await User.findOne({
        $or: [
          { login: cleanIdentifier },
          { username: cleanIdentifier },
          { email: cnpjOrUsername }
        ]
      })

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        })
      }

      if (!user.celular) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não possui celular cadastrado'
        })
      }

      // Gerar código de 6 dígitos
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()
      const expiraEm = new Date(Date.now() + 10 * 60 * 1000) // 10 minutos

      // Salvar código no usuário
      await User.updateOne(
        { _id: user._id },
        { 
          $set: {
            'recuperacao_senha.codigo': codigo,
            'recuperacao_senha.expira_em': expiraEm,
            'recuperacao_senha.metodo': 'sms',
            'recuperacao_senha.celular': user.celular
          }
        }
      )

      // Enviar SMS usando configuração do sistema
      const IntegrationService = require('../services/IntegrationService')
      const axios = require('axios')
      const { formatPhoneForSMS } = require('../utils/phone')
      const Tenant = require('../schemas/Tenant')

      // Para admin, usar configuração do primeiro tenant disponível
      // Para portal user, usar configuração do tenant dele
      let tenantId = user.tenant_id
      
      if (!tenantId) {
        // Admin não tem tenant, usar primeiro tenant do sistema
        const firstTenant = await Tenant.findOne()
        if (!firstTenant) {
          logger.error('Nenhum tenant encontrado para enviar SMS')
          return res.status(500).json({
            success: false,
            message: 'Sistema de SMS não configurado'
          })
        }
        tenantId = firstTenant._id
      }

      const integration = await IntegrationService.findByTenantAndType(tenantId, 'sms')
      
      if (!integration?.sms?.enabled) {
        logger.error('SMS não configurado ou habilitado')
        return res.status(500).json({
          success: false,
          message: 'Sistema de SMS não configurado'
        })
      }

      const smsUrl = integration.sms.endpoint || integration.sms.url
      const smsUser = integration.sms.username || integration.sms.user
      const smsPassword = integration.sms.token || integration.sms.password
      const smsMethod = integration.sms.method || 'POST'

      if (!smsUrl || !smsUser || !smsPassword) {
        logger.error('Configuração SMS incompleta')
        return res.status(500).json({
          success: false,
          message: 'Sistema de SMS não configurado'
        })
      }

      const phoneFormatted = formatPhoneForSMS(user.celular)
      const mensagem = `Seu código de recuperação MK-Edge é: ${codigo}. Válido por 10 minutos.`

      const paramsObj = {
        u: smsUser,
        p: smsPassword,
        to: `55${phoneFormatted}`,
        msg: mensagem
      }

      const params = new URLSearchParams(paramsObj)

      try {
        let smsResponse
        if (smsMethod === 'GET') {
          smsResponse = await axios.get(`${smsUrl}?${params.toString()}`, { timeout: 10000 })
        } else {
          smsResponse = await axios.post(smsUrl, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
          })
        }

        logger.info('Código SMS enviado com sucesso', {
          identifier: cnpjOrUsername,
          telefone: phoneFormatted,
          response: smsResponse.data
        })

        return res.json({
          success: true,
          message: 'Código enviado via SMS'
        })
      } catch (smsError) {
        logger.error('Erro ao enviar SMS:', smsError.message)
        return res.status(500).json({
          success: false,
          message: 'Erro ao enviar SMS: ' + smsError.message
        })
      }

    } catch (error) {
      logger.error('Erro ao solicitar código SMS:', error)
      return res.status(500).json({
        success: false,
        message: 'Erro ao solicitar código SMS'
      })
    }
  }

  /**
   * POST /api/auth/password-recovery/request-email
   * Solicitar código via Email
   */
  static async requestEmailRecovery(req, res) {
    try {
      const { cnpjOrUsername } = req.body

      if (!cnpjOrUsername) {
        return res.status(400).json({
          success: false,
          message: 'CNPJ ou username é obrigatório'
        })
      }

      // Buscar usuário (admin ou portal)
      const User = require('../schemas/User')
      const cleanIdentifier = cnpjOrUsername.replace(/[.\-\/]/g, '')
      
      const user = await User.findOne({
        $or: [
          { login: cleanIdentifier },
          { username: cleanIdentifier },
          { email: cnpjOrUsername }
        ]
      })

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        })
      }

      if (!user.email) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não possui email cadastrado'
        })
      }

      // Gerar código de 6 dígitos
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()
      const expiraEm = new Date(Date.now() + 10 * 60 * 1000) // 10 minutos

      // Salvar código no usuário
      await User.updateOne(
        { _id: user._id },
        { 
          $set: {
            'recuperacao_senha.codigo': codigo,
            'recuperacao_senha.expira_em': expiraEm,
            'recuperacao_senha.metodo': 'email',
            'recuperacao_senha.email_recovery': user.email
          }
        }
      )

      // Enviar Email usando configuração SMTP
      const IntegrationService = require('../services/IntegrationService')
      const nodemailer = require('nodemailer')
      const Tenant = require('../schemas/Tenant')

      // Para admin, usar configuração do primeiro tenant disponível
      // Para portal user, usar configuração do tenant dele
      let tenantId = user.tenant_id
      
      if (!tenantId) {
        // Admin não tem tenant, usar primeiro tenant do sistema
        const firstTenant = await Tenant.findOne()
        if (!firstTenant) {
          logger.error('Nenhum tenant encontrado para enviar Email')
          return res.status(500).json({
            success: false,
            message: 'Sistema de Email não configurado'
          })
        }
        tenantId = firstTenant._id
      }

      const integration = await IntegrationService.findByTenantAndType(tenantId, 'email')
      
      if (!integration?.email?.enabled) {
        logger.error('Email não configurado ou habilitado')
        return res.status(500).json({
          success: false,
          message: 'Sistema de Email não configurado'
        })
      }

      const emailConfig = integration.email

      const host = emailConfig.host || emailConfig.smtp_host
      const port = emailConfig.port || emailConfig.smtp_port
      const userEmail = emailConfig.user || emailConfig.username || emailConfig.usuario
      const passwordEmail = emailConfig.password || emailConfig.senha
      const fromEmail = emailConfig.from || emailConfig.from_email || userEmail
      const fromName = emailConfig.from_name || 'MK-Edge'
      const secureFlag = emailConfig.secure === true || Number(port) === 465
      const requireTLS = emailConfig.usar_tls === true

      if (!host || !port || !userEmail || !passwordEmail) {
        logger.error('Configuração Email incompleta')
        return res.status(500).json({
          success: false,
          message: 'Sistema de Email não configurado'
        })
      }

      try {
        // Criar transporter SMTP
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: !!secureFlag,
          requireTLS,
          tls: {
            rejectUnauthorized: false
          },
          auth: {
            user: userEmail,
            pass: passwordEmail
          }
        })

        // Enviar email
        const mailOptions = {
          from: `"${fromName}" <${fromEmail}>`,
          to: user.email,
          subject: 'Recuperação de Senha - MK-Edge',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Recuperação de Senha</h2>
              <p>Você solicitou a recuperação de senha do sistema MK-Edge.</p>
              <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #666;">Seu código de recuperação é:</p>
                <h1 style="margin: 10px 0; color: #2563eb; font-size: 36px; letter-spacing: 5px;">${codigo}</h1>
              </div>
              <p style="color: #666;">Este código é válido por <strong>10 minutos</strong>.</p>
              <p style="color: #666; font-size: 12px;">Se você não solicitou esta recuperação, ignore este email.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #999; font-size: 11px; text-align: center;">MK-Edge - Sistema de Gerenciamento</p>
            </div>
          `
        }

        await transporter.sendMail(mailOptions)

        logger.info('Código Email enviado com sucesso', {
          identifier: cnpjOrUsername,
          email: user.email
        })

        return res.json({
          success: true,
          message: 'Código enviado via Email'
        })
      } catch (emailError) {
        logger.error('Erro ao enviar Email:', emailError.message)
        return res.status(500).json({
          success: false,
          message: 'Erro ao enviar Email: ' + emailError.message
        })
      }

    } catch (error) {
      logger.error('Erro ao solicitar código Email:', error)
      return res.status(500).json({
        success: false,
        message: 'Erro ao solicitar código Email'
      })
    }
  }

  /**
   * POST /api/auth/password-recovery/request-whatsapp
   * Solicitar código via WhatsApp
   */
  static async requestWhatsappRecovery(req, res) {
    try {
      const { cnpjOrUsername } = req.body

      if (!cnpjOrUsername) {
        return res.status(400).json({
          success: false,
          message: 'CNPJ ou username é obrigatório'
        })
      }

      // Buscar usuário (admin ou portal)
      const User = require('../schemas/User')
      const cleanIdentifier = cnpjOrUsername.replace(/[.\-\/]/g, '')
      
      const user = await User.findOne({
        $or: [
          { login: cleanIdentifier },
          { username: cleanIdentifier },
          { email: cnpjOrUsername }
        ]
      })

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        })
      }

      if (!user.celular) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não possui celular cadastrado'
        })
      }

      // Gerar código de 6 dígitos
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()
      const expiraEm = new Date(Date.now() + 10 * 60 * 1000) // 10 minutos

      // Salvar código no usuário
      await User.updateOne(
        { _id: user._id },
        { 
          $set: {
            'recuperacao_senha.codigo': codigo,
            'recuperacao_senha.expira_em': expiraEm,
            'recuperacao_senha.metodo': 'whatsapp',
            'recuperacao_senha.celular': user.celular
          }
        }
      )

      // Enviar WhatsApp usando configuração Z-API
      const IntegrationService = require('../services/IntegrationService')
      const axios = require('axios')
      const { formatPhoneForSMS } = require('../utils/phone')
      const Tenant = require('../schemas/Tenant')

      // Para admin, usar configuração do primeiro tenant disponível
      // Para portal user, usar configuração do tenant dele
      let tenantId = user.tenant_id
      
      if (!tenantId) {
        // Admin não tem tenant, usar primeiro tenant do sistema
        const firstTenant = await Tenant.findOne()
        if (!firstTenant) {
          logger.error('Nenhum tenant encontrado para enviar WhatsApp')
          return res.status(500).json({
            success: false,
            message: 'Sistema de WhatsApp não configurado'
          })
        }
        tenantId = firstTenant._id
      }

      const integration = await IntegrationService.findByTenantAndType(tenantId, 'zapi')
      
      if (!integration?.zapi?.enabled) {
        logger.error('WhatsApp não configurado ou habilitado')
        return res.status(500).json({
          success: false,
          message: 'Sistema de WhatsApp não configurado'
        })
      }

      const zapiInstanceId = integration.zapi.instanceId
      const zapiToken = integration.zapi.instanceToken
      const zapiSecurityToken = integration.zapi.securityToken
      const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}`

      if (!zapiInstanceId || !zapiToken || !zapiSecurityToken) {
        logger.error('Configuração WhatsApp incompleta')
        return res.status(500).json({
          success: false,
          message: 'Sistema de WhatsApp não configurado'
        })
      }

      const phoneFormatted = formatPhoneForSMS(user.celular)
      const mensagem = `🔐 *MK-Edge - Recuperação de Senha*\n\nSeu código de recuperação é: *${codigo}*\n\nVálido por 10 minutos.`

      try {
        const zapiResponse = await axios.post(
          `${zapiUrl}/send-text`,
          {
            phone: phoneFormatted,
            message: mensagem
          },
          {
            headers: {
              'Client-Token': zapiSecurityToken,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        )

        logger.info('Código WhatsApp enviado com sucesso', {
          identifier: cnpjOrUsername,
          telefone: phoneFormatted,
          response: zapiResponse.data
        })

        return res.json({
          success: true,
          message: 'Código enviado via WhatsApp'
        })
      } catch (whatsappError) {
        logger.error('Erro ao enviar WhatsApp:', whatsappError.message)
        return res.status(500).json({
          success: false,
          message: 'Erro ao enviar WhatsApp: ' + whatsappError.message
        })
      }

    } catch (error) {
      logger.error('Erro ao solicitar código WhatsApp:', error)
      return res.status(500).json({
        success: false,
        message: 'Erro ao solicitar código WhatsApp'
      })
    }
  }

  /**
   * POST /api/auth/password-recovery/verify-code
   * Verificar código e resetar senha
   */
  static async verifyCodeAndReset(req, res) {
    try {
      const { cnpjOrUsername, code, newPassword } = req.body

      if (!cnpjOrUsername || !code || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'CNPJ/username, código e nova senha são obrigatórios'
        })
      }

      // Buscar usuário
      const User = require('../schemas/User')
      const cleanIdentifier = cnpjOrUsername.replace(/[.\-\/]/g, '')

      const user = await User.findOne({
        $or: [
          { login: cleanIdentifier },
          { username: cleanIdentifier },
          { email: cnpjOrUsername }
        ]
      })

      if (!user) {
        logger.warn('Tentativa de reset de senha para usuário não encontrado', {
          identifier: cnpjOrUsername
        })
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        })
      }

      // Validar código
      if (!user.recuperacao_senha || !user.recuperacao_senha.codigo) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum código de recuperação solicitado'
        })
      }

      // Verificar se código expirou
      if (new Date() > new Date(user.recuperacao_senha.expira_em)) {
        return res.status(400).json({
          success: false,
          message: 'Código expirado. Solicite um novo código.'
        })
      }

      // Verificar se código está correto
      if (user.recuperacao_senha.codigo !== code) {
        return res.status(400).json({
          success: false,
          message: 'Código inválido'
        })
      }

      // Hashear a nova senha
      const bcrypt = require('bcryptjs')
      const novaSenhaHash = await bcrypt.hash(newPassword, 10)

      // Atualizar senha e limpar código de recuperação
      await User.updateOne(
        { _id: user._id },
        { 
          senha: novaSenhaHash,
          $unset: { recuperacao_senha: 1 }
        }
      )

      logger.info('Senha resetada com sucesso', {
        identifier: cnpjOrUsername,
        userId: user._id
      })

      return res.json({
        success: true,
        message: 'Senha resetada com sucesso'
      })
    } catch (error) {
      logger.error('Erro ao resetar senha:', error)
      return res.status(500).json({
        success: false,
        message: 'Erro ao resetar senha'
      })
    }
  }
}

module.exports = PasswordRecoveryController
