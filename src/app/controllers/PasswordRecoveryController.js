/**
 * PasswordRecoveryController.js
 * Gerencia recuperação de senha
 */

const logger = require('../../logger')
const User = require('../schemas/User')
const Tenant = require('../schemas/Tenant')
const MkAuthAgentService = require('../services/MkAuthAgentService')
const crypto = require('crypto')
const PasswordRecoveryToken = require('../schemas/PasswordRecoveryToken')

class PasswordRecoveryController {
  static sanitizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!email) return '';

    const invalidValues = ['****', '***', 'nao informado', 'não informado', 'n/a', 'null', 'undefined', '-'];
    if (invalidValues.includes(email)) return '';
    if (!email.includes('@')) return '';

    return email;
  }

  static sanitizePhone(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const lowered = raw.toLowerCase();
    const invalidValues = ['****', '***', 'nao informado', 'não informado', 'n/a', 'null', 'undefined', '-'];
    if (invalidValues.includes(lowered)) return '';

    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8) return '';

    return digits;
  }

  static maskEmail(email) {
    if (!email) return '****';

    const [localPart, domain] = String(email).split('@');
    if (!localPart || !domain) return '****';

    const visible = localPart.slice(0, 2);
    return `${visible || '*'}***@${domain}`;
  }

  static maskPhone(phone) {
    if (!phone) return '****';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 4) return '****';

    return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
  }

  static resolveRecoveryContacts(user) {
    const email = (
      user?.email ||
      user?.recuperacao_senha?.email_recovery ||
      ''
    );

    const phone = (
      user?.celular ||
      user?.recuperacao_senha?.celular ||
      user?.telefone ||
      ''
    );

    const emailSanitized = PasswordRecoveryController.sanitizeEmail(email)
    const phoneSanitized = PasswordRecoveryController.sanitizePhone(phone)

    return {
      email: emailSanitized,
      phone: phoneSanitized,
      emailAvailable: !!emailSanitized,
      phoneAvailable: !!phoneSanitized
    };
  }

  static async resolveTenantForRecovery(req, user) {
    const tenantId = user?.tenant_id || req?.query?.tenant_id || req?.body?.tenant_id || null
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId)
      if (tenant) {
        return tenant
      }
    }

    return Tenant.findOne()
  }

  static async resolveRecoveryContactsWithFallback(req, user, identifier) {
    const localContacts = PasswordRecoveryController.resolveRecoveryContacts(user)
    if (localContacts.emailAvailable && localContacts.phoneAvailable) {
      return localContacts
    }

    let email = localContacts.email
    let phone = localContacts.phone

    try {
      const tenant = await PasswordRecoveryController.resolveTenantForRecovery(req, user)
      if (tenant && tenant.usaAgente && tenant.usaAgente()) {
        const login = String(user?.login || identifier || '').trim()
        if (login) {
          let mkAuthUser = null
          let mkAuthEmployee = null

          try {
            const directFields = await MkAuthAgentService.sendToAgent(
              tenant,
              'SELECT login, email, func FROM sis_acesso WHERE login = :login LIMIT 1',
              { login }
            )
            mkAuthUser = directFields?.data?.[0] || null
          } catch (directError) {
            // Fallback seguro: busca linha completa caso algum campo não exista no schema.
            const fullRow = await MkAuthAgentService.sendToAgent(
              tenant,
              'SELECT * FROM sis_acesso WHERE login = :login LIMIT 1',
              { login }
            )
            mkAuthUser = fullRow?.data?.[0] || null
          }

          if (mkAuthUser) {
            const funcId = mkAuthUser.func || mkAuthUser.id_func || null

            if (funcId) {
              try {
                const employeeResult = await MkAuthAgentService.sendToAgent(
                  tenant,
                  'SELECT id, email, celular, telefone FROM sis_func WHERE id = :id LIMIT 1',
                  { id: funcId }
                )
                mkAuthEmployee = employeeResult?.data?.[0] || null
              } catch (employeeError) {
                logger.warn('Falha ao buscar celular em sis_func', {
                  identifier,
                  login,
                  funcId,
                  error: employeeError.message
                })
              }
            }

            const mkAuthEmail = PasswordRecoveryController.sanitizeEmail(
              mkAuthEmployee?.email || mkAuthUser.email || mkAuthUser.mail || mkAuthUser.email_recovery
            )
            const mkAuthPhone = PasswordRecoveryController.sanitizePhone(
              mkAuthEmployee?.celular ||
              mkAuthEmployee?.telefone ||
              mkAuthUser.celular ||
              mkAuthUser.telefone ||
              mkAuthUser.fone ||
              mkAuthUser.phone
            )

            if (!email && mkAuthEmail) {
              email = mkAuthEmail
            }
            if (!phone && mkAuthPhone) {
              phone = mkAuthPhone
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Falha ao buscar contatos de usuario no MKAuth para recuperação', {
        identifier,
        error: error.message
      })
    }

    return {
      email,
      phone,
      emailAvailable: !!email,
      phoneAvailable: !!phone
    }
  }

  static async buildMkAuthPasswordHash(plainPassword) {
    const bcrypt = require('bcryptjs')
    const sha256Hash = crypto.createHash('sha256').update(String(plainPassword)).digest('hex')
    return bcrypt.hash(sha256Hash, 10)
  }

  static async findLocalUserByIdentifier(identifier) {
    return User.findOne(PasswordRecoveryController.buildIdentifierQuery(identifier))
  }

  static async createRecoveryToken({ user, tenant, login, code, method, contact }) {
    await PasswordRecoveryToken.deleteMany({
      login,
      tenant_id: tenant._id,
      purpose: 'password_recovery',
      used: false
    })

    return PasswordRecoveryToken.create({
      user_id: user?._id,
      login,
      tenant_id: tenant._id,
      code,
      method,
      contact,
      purpose: 'password_recovery',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    })
  }

  static normalizeCpf(value) {
    return String(value || '').replace(/\D/g, '')
  }

  static async resolveTenantFromRequest(req, user = null) {
    const tenantId =
      user?.tenant_id ||
      req?.query?.tenant_id ||
      req?.body?.tenant_id ||
      null

    if (tenantId) {
      const byId = await Tenant.findById(tenantId)
      if (byId) return byId
    }

    return PasswordRecoveryController.resolveTenantForRecovery(req, user)
  }

  static async findClientByCpf(tenant, cpf) {
    const cleanCpf = PasswordRecoveryController.normalizeCpf(cpf)
    if (!cleanCpf || cleanCpf.length !== 11) {
      return null
    }

    const result = await MkAuthAgentService.sendToAgent(
      tenant,
      `SELECT id, login, nome, email, celular, fone, cpf_cnpj
       FROM sis_cliente
       WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), ' ', '') = :cpf_cnpj
          OR REPLACE(REPLACE(REPLACE(login, '.', ''), '-', ''), ' ', '') = :cpf_login
       ORDER BY id DESC
       LIMIT 1`,
      {
        cpf_cnpj: cleanCpf,
        cpf_login: cleanCpf
      }
    )

    return result?.data?.[0] || null
  }

  static async createClientLogin2FAToken({ tenant, login, code, method, contact }) {
    await PasswordRecoveryToken.deleteMany({
      login,
      tenant_id: tenant._id,
      purpose: 'client_login_2fa',
      used: false
    })

    return PasswordRecoveryToken.create({
      login,
      tenant_id: tenant._id,
      code,
      method,
      contact,
      purpose: 'client_login_2fa',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    })
  }

  static normalizeCnpj(value) {
    if (!value) return '';
    return String(value).replace(/[^\d]/g, '');
  }

  static formatCnpj(value) {
    const digits = PasswordRecoveryController.normalizeCnpj(value);
    if (digits.length !== 14) return digits;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }

  static buildIdentifierQuery(identifier) {
    const cleanIdentifier = PasswordRecoveryController.normalizeCnpj(identifier);
    const formattedIdentifier = PasswordRecoveryController.formatCnpj(cleanIdentifier);

    return {
      $or: [
        { login: cleanIdentifier },
        { login: formattedIdentifier },
        { login: identifier },
        { username: cleanIdentifier },
        { username: identifier },
        { email: identifier }
      ]
    };
  }

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
      const user = await User.findOne(
        PasswordRecoveryController.buildIdentifierQuery(identifier)
      ).lean()

      // Usuário MKAuth: usa cadastro local e fallback no MKAuth Agent.
      const { email, phone, emailAvailable, phoneAvailable } = await PasswordRecoveryController.resolveRecoveryContactsWithFallback(
        req,
        user,
        identifier
      )

      const mascaraEmail = PasswordRecoveryController.maskEmail(email)
      const mascaraPhone = PasswordRecoveryController.maskPhone(phone)

      logger.info('Contatos de recuperação de senha obtidos', {
        identifier,
        found: !!user,
        hasEmail: emailAvailable,
        hasPhone: phoneAvailable
      })

      return res.json({
        success: true,
        data: {
          emailMasked: mascaraEmail,
          phoneMasked: mascaraPhone,
          emailAvailable,
          phoneAvailable,
          smsEnabled: phoneAvailable,
          whatsappEnabled: phoneAvailable,
          emailEnabled: emailAvailable
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

      const user = await PasswordRecoveryController.findLocalUserByIdentifier(cnpjOrUsername)
      const login = String(user?.login || cnpjOrUsername).trim()

      if (!login) {
        return res.status(400).json({ success: false, message: 'Usuário inválido' })
      }

      const { phone: recoveryPhone } = await PasswordRecoveryController.resolveRecoveryContactsWithFallback(
        req,
        user,
        login
      )

      if (!recoveryPhone) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não possui telefone/celular cadastrado'
        })
      }

      // Gerar código de 6 dígitos
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()

      const tenant = await PasswordRecoveryController.resolveTenantForRecovery(req, user)
      if (!tenant) {
        return res.status(500).json({ success: false, message: 'Tenant não encontrado para recuperação' })
      }

      await PasswordRecoveryController.createRecoveryToken({
        user,
        tenant,
        login,
        code: codigo,
        method: 'sms',
        contact: recoveryPhone
      })

      // Enviar SMS usando configuração do sistema
      const IntegrationService = require('../services/IntegrationService')
      const axios = require('axios')
      const { formatPhoneForSMS } = require('../utils/phone')
      const Tenant = require('../schemas/Tenant')

      // Para admin, usar configuração do primeiro tenant disponível
      // Para portal user, usar configuração do tenant dele
      let tenantId = tenant._id
      
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

      const phoneFormatted = formatPhoneForSMS(recoveryPhone)
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

      const user = await PasswordRecoveryController.findLocalUserByIdentifier(cnpjOrUsername)
      const login = String(user?.login || cnpjOrUsername).trim()

      if (!login) {
        return res.status(400).json({ success: false, message: 'Usuário inválido' })
      }

      const { email: recoveryEmail } = await PasswordRecoveryController.resolveRecoveryContactsWithFallback(
        req,
        user,
        login
      )

      if (!recoveryEmail) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não possui email cadastrado'
        })
      }

      // Gerar código de 6 dígitos
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()

      const tenant = await PasswordRecoveryController.resolveTenantForRecovery(req, user)
      if (!tenant) {
        return res.status(500).json({ success: false, message: 'Tenant não encontrado para recuperação' })
      }

      await PasswordRecoveryController.createRecoveryToken({
        user,
        tenant,
        login,
        code: codigo,
        method: 'email',
        contact: recoveryEmail
      })

      // Enviar Email usando configuração SMTP
      const IntegrationService = require('../services/IntegrationService')
      const nodemailer = require('nodemailer')
      const Tenant = require('../schemas/Tenant')

      // Para admin, usar configuração do primeiro tenant disponível
      // Para portal user, usar configuração do tenant dele
      let tenantId = tenant._id
      
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
          to: recoveryEmail,
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
          email: recoveryEmail
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
      
      const user = await User.findOne(
        PasswordRecoveryController.buildIdentifierQuery(cnpjOrUsername)
      )

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        })
      }

      const { phone: recoveryPhone } = await PasswordRecoveryController.resolveRecoveryContactsWithFallback(
        req,
        user,
        cnpjOrUsername
      )

      if (!recoveryPhone) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não possui telefone/celular cadastrado'
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
            'recuperacao_senha.celular': recoveryPhone
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

      const phoneFormatted = formatPhoneForSMS(recoveryPhone)
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

      const user = await PasswordRecoveryController.findLocalUserByIdentifier(cnpjOrUsername)
      const login = String(user?.login || cnpjOrUsername).trim()

      if (!login) {
        return res.status(400).json({ success: false, message: 'Usuário inválido' })
      }

      const tenant = await PasswordRecoveryController.resolveTenantForRecovery(req, user)
      if (!tenant) {
        return res.status(500).json({ success: false, message: 'Tenant não encontrado para recuperação' })
      }

      const token = await PasswordRecoveryToken.findOne({
        login,
        tenant_id: tenant._id,
        purpose: 'password_recovery',
        code,
        used: false,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 })

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Código inválido ou expirado'
        })
      }

      // Hashear a nova senha para usuário local
      const bcrypt = require('bcryptjs')
      const novaSenhaHash = await bcrypt.hash(newPassword, 10)

      // Hash compatível com login do app no MKAuth (SHA256 -> bcrypt)
      const mkAuthShaBcryptHash = await PasswordRecoveryController.buildMkAuthPasswordHash(newPassword)

      const loginToUpdate = login

      if (tenant && tenant.usaAgente && tenant.usaAgente() && loginToUpdate) {
        const mkAuthUpdateResult = await MkAuthAgentService.sendToAgent(
          tenant,
          'UPDATE sis_acesso SET sha = :sha WHERE login = :login LIMIT 1',
          {
            sha: mkAuthShaBcryptHash,
            login: loginToUpdate
          }
        )

        if (!mkAuthUpdateResult?.success) {
          logger.error('Falha ao atualizar senha no MKAuth', {
            identifier: cnpjOrUsername,
            login: loginToUpdate
          })

          return res.status(500).json({
            success: false,
            message: 'Erro ao atualizar senha no MKAuth'
          })
        }
      } else {
        logger.warn('Tenant/agente indisponivel para atualizar senha no MKAuth', {
          identifier: cnpjOrUsername,
          login: loginToUpdate
        })
      }

      // Marcar token como utilizado
      token.used = true
      token.usedAt = new Date()
      await token.save()

      // Atualizar senha local somente se usuário existir no Mongo
      if (user?._id) {
        await User.updateOne(
          { _id: user._id },
          {
            senha: novaSenhaHash,
            $unset: { recuperacao_senha: 1 }
          }
        )
      }

      logger.info('Senha resetada com sucesso', {
        identifier: cnpjOrUsername,
        userId: user?._id || null,
        login: loginToUpdate
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

  /**
   * GET /api/auth/login-2fa/contacts
   * Obter contatos mascarados do cliente por CPF
   */
  static async getClient2FAContacts(req, res) {
    try {
      const { cpf } = req.query

      if (!cpf) {
        return res.status(400).json({
          success: false,
          message: 'CPF é obrigatório'
        })
      }

      const tenant = await PasswordRecoveryController.resolveTenantFromRequest(req)
      if (!tenant || !tenant.usaAgente || !tenant.usaAgente()) {
        return res.status(400).json({
          success: false,
          message: 'Provedor sem integração com agente'
        })
      }

      const client = await PasswordRecoveryController.findClientByCpf(tenant, cpf)
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado para este CPF'
        })
      }

      const email = PasswordRecoveryController.sanitizeEmail(client.email)
      const phone = PasswordRecoveryController.sanitizePhone(client.celular || client.fone)

      return res.json({
        success: true,
        data: {
          emailMasked: PasswordRecoveryController.maskEmail(email),
          phoneMasked: PasswordRecoveryController.maskPhone(phone),
          emailAvailable: !!email,
          phoneAvailable: !!phone,
          emailEnabled: !!email,
          smsEnabled: !!phone,
          clientLogin: String(client.login || '').trim() || undefined,
          clientName: String(client.nome || '').trim() || undefined
        }
      })
    } catch (error) {
      logger.error('Erro ao obter contatos 2FA de cliente:', error)
      return res.status(500).json({
        success: false,
        message: 'Erro ao obter contatos de verificação'
      })
    }
  }

  /**
   * POST /api/auth/login-2fa/request-code
   * Solicitar código de login 2FA do cliente por email ou SMS
   */
  static async requestClient2FACode(req, res) {
    try {
      const { cpf, method } = req.body
      const methodNormalized = String(method || '').trim().toLowerCase()

      if (!cpf || !['email', 'sms'].includes(methodNormalized)) {
        return res.status(400).json({
          success: false,
          message: 'CPF e método (email ou sms) são obrigatórios'
        })
      }

      const tenant = await PasswordRecoveryController.resolveTenantFromRequest(req)
      if (!tenant || !tenant.usaAgente || !tenant.usaAgente()) {
        return res.status(400).json({
          success: false,
          message: 'Provedor sem integração com agente'
        })
      }

      const client = await PasswordRecoveryController.findClientByCpf(tenant, cpf)
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado para este CPF'
        })
      }

      const login = String(client.login || '').trim()
      if (!login) {
        return res.status(400).json({
          success: false,
          message: 'Cliente sem login válido para verificação'
        })
      }

      const recoveryEmail = PasswordRecoveryController.sanitizeEmail(client.email)
      const recoveryPhone = PasswordRecoveryController.sanitizePhone(client.celular || client.fone)
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()

      if (methodNormalized === 'email' && !recoveryEmail) {
        return res.status(400).json({
          success: false,
          message: 'Cliente sem email cadastrado'
        })
      }

      if (methodNormalized === 'sms' && !recoveryPhone) {
        return res.status(400).json({
          success: false,
          message: 'Cliente sem celular cadastrado'
        })
      }

      await PasswordRecoveryController.createClientLogin2FAToken({
        tenant,
        login,
        code: codigo,
        method: methodNormalized,
        contact: methodNormalized === 'email' ? recoveryEmail : recoveryPhone
      })

      const IntegrationService = require('../services/IntegrationService')

      if (methodNormalized === 'email') {
        const nodemailer = require('nodemailer')

        const integration = await IntegrationService.findByTenantAndType(tenant._id, 'email')
        if (!integration?.email?.enabled) {
          return res.status(500).json({ success: false, message: 'Sistema de Email não configurado' })
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
          return res.status(500).json({ success: false, message: 'Sistema de Email não configurado' })
        }

        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: !!secureFlag,
          requireTLS,
          tls: { rejectUnauthorized: false },
          auth: { user: userEmail, pass: passwordEmail }
        })

        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: recoveryEmail,
          subject: 'Código de verificação - Login MK-Edge Cliente',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Verificação de login</h2>
              <p>Seu código para acessar o app cliente é:</p>
              <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
                <h1 style="margin: 10px 0; color: #2563eb; font-size: 36px; letter-spacing: 5px;">${codigo}</h1>
              </div>
              <p style="color: #666;">Este código é válido por <strong>10 minutos</strong>.</p>
            </div>
          `
        })

        return res.json({ success: true, message: 'Código enviado por email' })
      }

      const axios = require('axios')
      const { formatPhoneForSMS } = require('../utils/phone')

      const integration = await IntegrationService.findByTenantAndType(tenant._id, 'sms')
      if (!integration?.sms?.enabled) {
        return res.status(500).json({ success: false, message: 'Sistema de SMS não configurado' })
      }

      const smsUrl = integration.sms.endpoint || integration.sms.url
      const smsUser = integration.sms.username || integration.sms.user
      const smsPassword = integration.sms.token || integration.sms.password
      const smsMethod = integration.sms.method || 'POST'

      if (!smsUrl || !smsUser || !smsPassword) {
        return res.status(500).json({ success: false, message: 'Sistema de SMS não configurado' })
      }

      const phoneFormatted = formatPhoneForSMS(recoveryPhone)
      const mensagem = `Seu código de login MK-Edge é: ${codigo}. Válido por 10 minutos.`
      const paramsObj = {
        u: smsUser,
        p: smsPassword,
        to: `55${phoneFormatted}`,
        msg: mensagem
      }
      const params = new URLSearchParams(paramsObj)

      if (smsMethod === 'GET') {
        await axios.get(`${smsUrl}?${params.toString()}`, { timeout: 10000 })
      } else {
        await axios.post(smsUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        })
      }

      return res.json({ success: true, message: 'Código enviado por SMS' })
    } catch (error) {
      logger.error('Erro ao solicitar código 2FA do cliente:', error)
      return res.status(500).json({
        success: false,
        message: 'Erro ao solicitar código de verificação'
      })
    }
  }

  /**
   * POST /api/auth/login-2fa/verify-code
   * Valida o código de login 2FA do cliente
   */
  static async verifyClient2FACode(req, res) {
    try {
      const { cpf, code } = req.body

      if (!cpf || !code) {
        return res.status(400).json({
          success: false,
          message: 'CPF e código são obrigatórios'
        })
      }

      const tenant = await PasswordRecoveryController.resolveTenantFromRequest(req)
      if (!tenant || !tenant.usaAgente || !tenant.usaAgente()) {
        return res.status(400).json({
          success: false,
          message: 'Provedor sem integração com agente'
        })
      }

      const client = await PasswordRecoveryController.findClientByCpf(tenant, cpf)
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado para este CPF'
        })
      }

      const login = String(client.login || '').trim()
      if (!login) {
        return res.status(400).json({
          success: false,
          message: 'Cliente sem login válido para verificação'
        })
      }

      const token = await PasswordRecoveryToken.findOne({
        login,
        tenant_id: tenant._id,
        purpose: 'client_login_2fa',
        code: String(code).trim(),
        used: false,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 })

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Código inválido ou expirado'
        })
      }

      token.used = true
      token.usedAt = new Date()
      await token.save()

      return res.json({
        success: true,
        message: 'Código validado com sucesso'
      })
    } catch (error) {
      logger.error('Erro ao validar código 2FA do cliente:', error)
      return res.status(500).json({
        success: false,
        message: 'Erro ao validar código de verificação'
      })
    }
  }
}

module.exports = PasswordRecoveryController
