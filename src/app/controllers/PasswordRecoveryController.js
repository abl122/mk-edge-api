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
const mongoose = require('mongoose')

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
      const tenantIdStr = String(tenantId).trim()
      if (!mongoose.Types.ObjectId.isValid(tenantIdStr)) {
        return null
      }

      const tenant = await Tenant.findById(tenantIdStr)
      return tenant || null
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

  static isDocumentLike(value) {
    const digits = PasswordRecoveryController.normalizeClientDocument(value)
    return [11, 14].includes(digits.length)
  }

  static async resolveRecoveryIdentity(req, identifier) {
    const user = await PasswordRecoveryController.findLocalUserByIdentifier(identifier)
    const tenant = await PasswordRecoveryController.resolveTenantForRecovery(req, user)

    let login = String(user?.login || '').trim()
    let client = null

    if (tenant && tenant.usaAgente && tenant.usaAgente() && PasswordRecoveryController.isDocumentLike(identifier)) {
      client = await PasswordRecoveryController.findClientByDocument(tenant, identifier)
      const clientLogin = String(client?.login || '').trim()
      if (clientLogin) {
        login = clientLogin
      }
    }

    const contacts = await PasswordRecoveryController.resolveRecoveryContactsWithFallback(
      req,
      user,
      login || identifier
    )

    const clientEmail = PasswordRecoveryController.sanitizeEmail(client?.email)
    const clientPhone = PasswordRecoveryController.sanitizePhone(client?.celular || client?.fone)

    const email = contacts.email || clientEmail
    const phone = contacts.phone || clientPhone

    return {
      user,
      tenant,
      client,
      login,
      email,
      phone,
      emailAvailable: !!email,
      phoneAvailable: !!phone
    }
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
      const tenantIdStr = String(tenantId).trim()
      if (!mongoose.Types.ObjectId.isValid(tenantIdStr)) {
        return null
      }

      const byId = await Tenant.findById(tenantIdStr)
      return byId || null
    }

    return PasswordRecoveryController.resolveTenantForRecovery(req, user)
  }

  static normalizeClientDocument(value) {
    return String(value || '').replace(/\D/g, '')
  }

  static async findClientByDocument(tenant, document) {
    const cleanDocument = PasswordRecoveryController.normalizeClientDocument(document)
    if (!cleanDocument || ![11, 14].includes(cleanDocument.length)) {
      return null
    }

    const result = await MkAuthAgentService.sendToAgent(
      tenant,
      `SELECT id, login, nome, email, celular, fone, cpf_cnpj
       FROM sis_cliente
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', ''), ' ', '') = :cpf_cnpj
         OR REPLACE(REPLACE(REPLACE(REPLACE(login, '.', ''), '-', ''), '/', ''), ' ', '') = :cpf_login
       ORDER BY id DESC
       LIMIT 1`,
      {
        cpf_cnpj: cleanDocument,
        cpf_login: cleanDocument
      }
    )

    return result?.data?.[0] || null
  }

  static async findClientByCpf(tenant, cpf) {
    return PasswordRecoveryController.findClientByDocument(tenant, cpf)
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

  static parseSmsEnabled(value) {
    const text = String(value || '').trim().toLowerCase()
    return ['sim', 's', '1', 'true', 'on', 'enabled'].includes(text)
  }

  static normalizeSmsMethod(value) {
    const text = String(value || '').trim().toLowerCase()
    if (!text) return 'POST'
    if (text.includes('get')) return 'GET'
    if (text.includes('post')) return 'POST'
    return String(value || '').trim().toUpperCase()
  }

  static readSmsGatewayErrorCode(error) {
    if (!error || typeof error !== 'object') return ''
    return String(
      error?.code ||
      error?.cause?.code ||
      error?.cause?.cause?.code ||
      error?.response?.data?.errorCode ||
      ''
    ).trim().toUpperCase()
  }

  static readSmsGatewayErrorMessage(error) {
    if (!error || typeof error !== 'object') return ''
    return String(
      error?.message ||
      error?.cause?.message ||
      error?.cause?.cause?.message ||
      error?.response?.data?.message ||
      ''
    ).trim()
  }

  static hasTlsCertificateError(error) {
    const code = PasswordRecoveryController.readSmsGatewayErrorCode(error)
    if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') return true

    const message = PasswordRecoveryController.readSmsGatewayErrorMessage(error)
    return /ALTNAME_INVALID|ALTNAMES|CERT_ALTNAME|HOSTNAME\/IP DOESN'T MATCH|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF[_\s-]SIGNED|CERTIFICATE/i.test(message)
  }

  static isRetryableSmsGatewayCode(code) {
    return ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED'].includes(String(code || '').trim().toUpperCase())
  }

  static buildSmsGatewayUrls(rawUrl) {
    const primaryUrl = String(rawUrl || '').trim()
    if (!primaryUrl) return []

    const publicHost = String(process.env.SMS_MESSENGER_PUBLIC_HOST || 'mk-messenger.com.br').trim().toLowerCase()
    const privateHost = String(process.env.SMS_MESSENGER_PRIVATE_HOST || '172.31.255.3').trim()
    const urls = [primaryUrl]

    try {
      const parsed = new URL(primaryUrl)
      if (parsed.hostname.toLowerCase() === publicHost && privateHost) {
        parsed.hostname = privateHost
        urls.push(parsed.toString())
      }
    } catch {
      // Mantém apenas URL primária quando não for possível parsear.
    }

    return [...new Set(urls)]
  }

  static resolveSmsGatewayHostHeader(rawUrl) {
    const publicHost = String(process.env.SMS_MESSENGER_PUBLIC_HOST || 'mk-messenger.com.br').trim().toLowerCase()
    const privateHost = String(process.env.SMS_MESSENGER_PRIVATE_HOST || '172.31.255.3').trim().toLowerCase()
    if (!publicHost || !privateHost) return ''

    try {
      const parsed = new URL(String(rawUrl || '').trim())
      if (parsed.hostname.toLowerCase() === privateHost) {
        return publicHost
      }
    } catch {
      return ''
    }

    return ''
  }

  static isPrivateOrLocalHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase()
    if (!host) return false
    if (host === 'localhost' || host === '127.0.0.1') return true

    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
    if (!ipv4) return false

    if (/^10\./.test(host)) return true
    if (/^192\.168\./.test(host)) return true
    if (/^127\./.test(host)) return true

    const match172 = host.match(/^172\.(\d{1,3})\./)
    if (match172) {
      const secondOctet = Number(match172[1])
      if (secondOctet >= 16 && secondOctet <= 31) return true
    }

    return false
  }

  static shouldPreferSisOpcoesSms(integrationUrl) {
    try {
      const parsed = new URL(String(integrationUrl || '').trim())
      return PasswordRecoveryController.isPrivateOrLocalHost(parsed.hostname)
    } catch {
      return false
    }
  }

  static async resolveSmsGatewayConfig(tenant) {
    const IntegrationService = require('../services/IntegrationService')
    const integrationUrl = ''
    let sisOpcoesCanonicalHost = ''
    let integrationSmsConfig = null

    const buildSmsConfig = (source, smsUrl, smsUser, smsPassword, smsMethod, canonicalHost = '') => {
      return {
        source,
        enabled: !!smsUrl && !!smsUser && !!smsPassword,
        smsUrl,
        smsUser,
        smsPassword,
        smsMethod,
        canonicalHost
      }
    }

    try {
      const integration = await IntegrationService.findByTenantAndType(tenant._id, 'sms')
      const smsIntegration = integration?.sms || {}
      const smsUrl = String(smsIntegration.endpoint || smsIntegration.url || '').trim()
      const smsUser = String(smsIntegration.username || smsIntegration.user || '').trim()
      const smsPassword = String(smsIntegration.token || smsIntegration.password || '').trim()
      const smsMethod = PasswordRecoveryController.normalizeSmsMethod(smsIntegration.method || 'POST')

      let canonicalHost = ''
      try {
        canonicalHost = new URL(smsUrl).hostname
      } catch {
        canonicalHost = ''
      }

      const integrationEnabled = smsIntegration.enabled !== false && !!smsUrl && !!smsUser && !!smsPassword
      if (integrationEnabled) {
        integrationSmsConfig = buildSmsConfig('integration', smsUrl, smsUser, smsPassword, smsMethod, canonicalHost)
        logger.info('Configuração SMS carregada da integração local', {
          tenant_id: tenant?._id || null,
          endpoint_set: !!smsUrl,
          user_set: !!smsUser,
          method: smsMethod
        })
      }
    } catch (error) {
      logger.warn('Falha ao obter configuração SMS da integração local', {
        tenant_id: tenant?._id || null,
        error: error?.message || String(error)
      })
    }

    try {
      const fetchSmsOptions = async (tableName) => {
        return MkAuthAgentService.sendToAgent(
          tenant,
          `SELECT nome, valor
           FROM ${tableName}
           WHERE nome IN (
             'clmk_sms',
             'sms_servidor',
             'sms_dlogin',
             'sms_conta',
             'sms_senha',
             'sms_token',
             'sms_gt'
           )`,
          {}
        )
      }

      const optionsTableUsed = 'sis_opcao'
      const optionsResult = await fetchSmsOptions(optionsTableUsed)

      const optionsByName = {}
      for (const row of optionsResult?.data || []) {
        const key = String(row?.nome || '').trim().toLowerCase()
        const value = String(row?.valor || '').trim()
        if (key) optionsByName[key] = value
      }

      const mkAuthEnabled = PasswordRecoveryController.parseSmsEnabled(optionsByName.clmk_sms)
      const mkAuthUrl = String(optionsByName.sms_servidor || '').trim()
      const mkAuthUser = String(optionsByName.sms_dlogin || optionsByName.sms_conta || '').trim()
      const mkAuthPassword = String(optionsByName.sms_senha || optionsByName.sms_token || '').trim()
      const mkAuthMethod = PasswordRecoveryController.normalizeSmsMethod(optionsByName.sms_gt || 'POST')

      try {
        sisOpcoesCanonicalHost = new URL(mkAuthUrl).hostname
      } catch {
        sisOpcoesCanonicalHost = ''
      }

      const mkAuthComplete = !!mkAuthUrl && !!mkAuthUser && !!mkAuthPassword
      if (mkAuthComplete) {
        if (!mkAuthEnabled) {
          logger.warn('clmk_sms está desabilitado no MKAuth, mas 2FA seguirá com credenciais do agente (modo agent-only)', {
            tenant_id: tenant?._id || null,
            table: optionsTableUsed
          })
        }

        logger.info('Configuração SMS carregada do MKAuth', {
          tenant_id: tenant?._id || null,
          table: optionsTableUsed,
          endpoint_set: !!mkAuthUrl,
          user_set: !!mkAuthUser
        })

        logger.info('Usando configuração SMS de sis_opcao para 2FA', {
          tenant_id: tenant?._id || null,
          integration_url: integrationUrl,
          sis_opcao_url: mkAuthUrl
        })

        return {
          source: 'sis_opcao',
          enabled: true,
          smsUrl: mkAuthUrl,
          smsUser: mkAuthUser,
          smsPassword: mkAuthPassword,
          smsMethod: mkAuthMethod,
          canonicalHost: sisOpcoesCanonicalHost,
          fallback: integrationSmsConfig
        }
      }

      logger.warn('Configuração SMS de sis_opcao incompleta para 2FA', {
        tenant_id: tenant?._id || null,
        table: optionsTableUsed,
        mkauth_enabled: !!mkAuthEnabled,
        endpoint_set: !!mkAuthUrl,
        user_set: !!mkAuthUser,
        password_set: !!mkAuthPassword
      })

      if (integrationSmsConfig) {
        logger.warn('Usando integração local como fallback de SMS para 2FA', {
          tenant_id: tenant?._id || null,
          fallback_source: integrationSmsConfig.source,
          endpoint_set: !!integrationSmsConfig.smsUrl,
          user_set: !!integrationSmsConfig.smsUser,
          method: integrationSmsConfig.smsMethod
        })

        return integrationSmsConfig
      }
    } catch (error) {
      logger.warn('Falha ao obter configuração SMS em sis_opcao', {
        tenant_id: tenant?._id || null,
        error: error?.message || String(error)
      })
    }

    if (integrationSmsConfig) {
      logger.warn('Configuração SMS indisponível em sis_opcao; mantendo integração local como fallback', {
        tenant_id: tenant?._id || null,
        fallback_source: integrationSmsConfig.source
      })

      return integrationSmsConfig
    }

    logger.warn('Configuração SMS indisponível para 2FA: modo agent-only ativo (sem fallback integration)', {
      tenant_id: tenant?._id || null
    })

    return {
      source: 'agent_only_incomplete',
      enabled: false,
      smsUrl: '',
      smsUser: '',
      smsPassword: '',
      smsMethod: 'POST',
      canonicalHost: sisOpcoesCanonicalHost
    }
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

      const resolved = await PasswordRecoveryController.resolveRecoveryIdentity(req, identifier)
      const {
        user,
        email,
        phone,
        emailAvailable,
        phoneAvailable
      } = resolved

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

      const resolved = await PasswordRecoveryController.resolveRecoveryIdentity(req, cnpjOrUsername)
      const { user, tenant, login, phone: recoveryPhone } = resolved

      if (!login) {
        return res.status(400).json({ success: false, message: 'Usuário inválido' })
      }

      if (!recoveryPhone) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não possui telefone/celular cadastrado'
        })
      }

      // Gerar código de 6 dígitos
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()

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

      // Enviar SMS usando configuração resolvida (agente/sis_opcoes com fallback)
      const axios = require('axios')
      const https = require('https')
      const { formatPhoneForSMS } = require('../utils/phone')
      const smsConfig = await PasswordRecoveryController.resolveSmsGatewayConfig(tenant)
      if (!smsConfig.enabled) {
        logger.warn('Configuração SMS desabilitada para recuperação', {
          tenant_id: tenant?._id || null,
          source: smsConfig?.source || 'unknown'
        })
        return res.status(500).json({ success: false, message: 'Sistema de SMS não configurado' })
      }

      const smsUrl = String(smsConfig.smsUrl || '').trim()
      const smsUser = String(smsConfig.smsUser || '').trim()
      const smsPassword = String(smsConfig.smsPassword || '').trim()
      const smsMethod = String(smsConfig.smsMethod || 'POST').trim().toUpperCase()
      const smsConfigSource = String(smsConfig.source || 'unknown')
      const smsConfigCanonicalHost = String(smsConfig.canonicalHost || '').trim().toLowerCase()

      if (!smsUrl || !smsUser || !smsPassword) {
        logger.warn('Configuração SMS incompleta para recuperação', {
          tenant_id: tenant?._id || null,
          source: smsConfigSource,
          endpoint_set: !!smsUrl,
          user_set: !!smsUser,
          password_set: !!smsPassword
        })
        return res.status(500).json({
          success: false,
          message: 'Sistema de SMS não configurado'
        })
      }

      if (!['GET', 'POST'].includes(smsMethod)) {
        return res.status(500).json({
          success: false,
          message: 'Configuração SMS inválida: método deve ser GET ou POST'
        })
      }

      const phoneFormatted = formatPhoneForSMS(recoveryPhone)
      const mensagem = `Seu código de recuperação MK-Edge é: ${codigo}. Válido por 10 minutos.`
      const smsNumber = `55${phoneFormatted}`
      const smsGatewayTimeoutMs = Number(process.env.SMS_GATEWAY_TIMEOUT_MS || 10000)

      const normalizeSmsUrl = (rawUrl, canonicalHost = '') => {
        try {
          const parsed = new URL(rawUrl)
          const normalizedCanonicalHost = String(canonicalHost || '').trim().toLowerCase()
          const isMessengerHost = normalizedCanonicalHost && parsed.hostname.toLowerCase() === normalizedCanonicalHost
          const hasPath = parsed.pathname && parsed.pathname !== '/'

          if (isMessengerHost && !hasPath) {
            parsed.pathname = '/sms/index.php'
          }

          return parsed.toString()
        } catch {
          return rawUrl
        }
      }

      const requestSmsUrl = normalizeSmsUrl(smsUrl, smsConfigCanonicalHost)
      const legacyTlsCompatEnabled = String(process.env.SMS_TLS_INSECURE_COMPAT || 'true').toLowerCase() !== 'false'
      const gatewayUrlCandidates = PasswordRecoveryController.buildSmsGatewayUrls(requestSmsUrl)

      const params = new URLSearchParams({
        app: 'webservices',
        u: smsUser,
        p: smsPassword,
        to: smsNumber,
        msg: mensagem,
        token: smsUser,
        celular: `+${smsNumber}`,
        mensagem
      })

      const sendSmsRequest = async ({ smsRequestUrl = requestSmsUrl, allowInsecureTls = false, forceHttp = false } = {}) => {
        const targetUrl = forceHttp
          ? String(smsRequestUrl || '').replace(/^https:\/\//i, 'http://')
          : smsRequestUrl
        const isKnownTlsIncompatibleGateway = /mk-messenger\.com\.br|172\.31\.255\.3/i.test(String(targetUrl || ''))
        const hostHeader = PasswordRecoveryController.resolveSmsGatewayHostHeader(targetUrl)

        const requestOptions = {
          timeout: smsGatewayTimeoutMs,
          validateStatus: (status) => status < 500
        }

        if (hostHeader) {
          requestOptions.headers = {
            ...(requestOptions.headers || {}),
            Host: hostHeader
          }
        }

        // Aplicar httpsAgent sempre que allowInsecureTls for explícito (cobre redirects HTTP→HTTPS)
        if (allowInsecureTls || (/^https:\/\//i.test(String(targetUrl || '')) && (legacyTlsCompatEnabled || isKnownTlsIncompatibleGateway))) {
          requestOptions.httpsAgent = new https.Agent({ rejectUnauthorized: false })
        }

        if (smsMethod === 'GET') {
          return axios.get(`${targetUrl}?${params.toString()}`, requestOptions)
        }

        return axios.post(targetUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(requestOptions.headers || {})
          },
          ...requestOptions
        })
      }

      try {
        let smsResponse
        let smsResponseUrl = requestSmsUrl
        let lastSmsError = null

        for (const gatewayUrlCandidate of gatewayUrlCandidates) {
          const isHttpsSmsEndpoint = /^https:\/\//i.test(String(gatewayUrlCandidate || ''))

          try {
            try {
              smsResponse = await sendSmsRequest({ smsRequestUrl: gatewayUrlCandidate })
            } catch (firstSmsError) {
              const tlsCode = PasswordRecoveryController.readSmsGatewayErrorCode(firstSmsError)
              const tlsMessage = PasswordRecoveryController.readSmsGatewayErrorMessage(firstSmsError)
              const isTlsError = [
                'ERR_TLS_CERT_ALTNAME_INVALID',
                'DEPTH_ZERO_SELF_SIGNED_CERT',
                'SELF_SIGNED_CERT_IN_CHAIN',
                'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
              ].includes(tlsCode) || PasswordRecoveryController.hasTlsCertificateError(firstSmsError)

              if (!isTlsError || !isHttpsSmsEndpoint) {
                throw firstSmsError
              }

              logger.warn('TLS do gateway SMS inválido no recovery; retry com rejectUnauthorized=false', {
                identifier: cnpjOrUsername,
                source: smsConfigSource,
                sms_url: gatewayUrlCandidate,
                sms_method: smsMethod,
                gateway_code: tlsCode,
                gateway_message: tlsMessage || null
              })

              try {
                smsResponse = await sendSmsRequest({
                  smsRequestUrl: gatewayUrlCandidate,
                  allowInsecureTls: true
                })
              } catch (retryTlsError) {
                logger.warn('Retry TLS inseguro falhou no recovery; tentando gateway via HTTP', {
                  identifier: cnpjOrUsername,
                  source: smsConfigSource,
                  sms_url_https: gatewayUrlCandidate,
                  sms_url_http: String(gatewayUrlCandidate || '').replace(/^https:\/\//i, 'http://'),
                  sms_method: smsMethod,
                  gateway_code: PasswordRecoveryController.readSmsGatewayErrorCode(retryTlsError),
                  gateway_message: PasswordRecoveryController.readSmsGatewayErrorMessage(retryTlsError) || null
                })

                smsResponse = await sendSmsRequest({
                  smsRequestUrl: gatewayUrlCandidate,
                  forceHttp: true
                })
              }
            }

            smsResponseUrl = gatewayUrlCandidate
            break
          } catch (candidateError) {
            lastSmsError = candidateError
            const errorCode = PasswordRecoveryController.readSmsGatewayErrorCode(candidateError)
            const hasAnotherCandidate = gatewayUrlCandidates[gatewayUrlCandidates.length - 1] !== gatewayUrlCandidate
            const shouldTryNextHost = PasswordRecoveryController.isRetryableSmsGatewayCode(errorCode) || PasswordRecoveryController.hasTlsCertificateError(candidateError)

            if (hasAnotherCandidate && shouldTryNextHost) {
              logger.warn('Gateway SMS indisponível via domínio público no recovery; tentando host privado', {
                identifier: cnpjOrUsername,
                source: smsConfigSource,
                sms_url_current: gatewayUrlCandidate,
                sms_url_next: gatewayUrlCandidates[gatewayUrlCandidates.indexOf(gatewayUrlCandidate) + 1] || null,
                sms_method: smsMethod,
                gateway_code: errorCode,
                gateway_message: PasswordRecoveryController.readSmsGatewayErrorMessage(candidateError) || null
              })
              continue
            }

            throw candidateError
          }
        }

        if (!smsResponse && lastSmsError) {
          throw lastSmsError
        }

        const gatewayStatus = smsResponse?.status
        const gatewayData = smsResponse?.data
        const gatewayAccepted =
          gatewayStatus === 200 &&
          (
            typeof gatewayData !== 'object' ||
            gatewayData === null ||
            gatewayData.success !== false
          )

        if (!gatewayAccepted) {
          logger.warn('Gateway SMS rejeitou envio de recuperação', {
            identifier: cnpjOrUsername,
            source: smsConfigSource,
            sms_url: smsResponseUrl,
            sms_method: smsMethod,
            gateway_status: gatewayStatus,
            gateway_data: typeof gatewayData === 'string' ? gatewayData.slice(0, 400) : gatewayData
          })

          return res.status(502).json({
            success: false,
            message: 'Falha ao enviar SMS de recuperação',
            gatewayStatus
          })
        }

        logger.info('Código SMS enviado com sucesso', {
          identifier: cnpjOrUsername,
          source: smsConfigSource,
          telefone: phoneFormatted,
          response: gatewayData
        })

        return res.json({
          success: true,
          message: 'Código enviado via SMS'
        })
      } catch (smsError) {
        logger.error('Erro ao enviar SMS de recuperação:', smsError.message)
        return res.status(502).json({
          success: false,
          message: 'Falha ao enviar SMS de recuperação',
          gatewayStatus: smsError?.response?.status || null
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

      const resolved = await PasswordRecoveryController.resolveRecoveryIdentity(req, cnpjOrUsername)
      const { user, tenant, login, email: recoveryEmail } = resolved

      if (!login) {
        return res.status(400).json({ success: false, message: 'Usuário inválido' })
      }

      if (!recoveryEmail) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não possui email cadastrado'
        })
      }

      // Gerar código de 6 dígitos
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()

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
      const https = require('https')
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

      const resolved = await PasswordRecoveryController.resolveRecoveryIdentity(req, cnpjOrUsername)
      const { user, tenant, login } = resolved

      if (!login) {
        return res.status(400).json({ success: false, message: 'Usuário inválido' })
      }

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
   * Obter contatos mascarados do cliente por CPF/CNPJ
   */
  static async getClient2FAContacts(req, res) {
    try {
      const document = req.query?.document || req.query?.cpf || req.query?.cpfCnpj

      if (!document) {
        return res.status(400).json({
          success: false,
          message: 'CPF/CNPJ é obrigatório'
        })
      }

      const tenant = await PasswordRecoveryController.resolveTenantFromRequest(req)
      if (!tenant || !tenant.usaAgente || !tenant.usaAgente()) {
        return res.status(400).json({
          success: false,
          message: 'Provedor sem integração com agente'
        })
      }

      const client = await PasswordRecoveryController.findClientByDocument(tenant, document)
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não localizado para o CPF/CNPJ'
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
      logger.error('Erro ao obter contatos 2FA de cliente', {
        error: error?.message || String(error),
        stack: error?.stack,
        tenant_id: req?.query?.tenant_id || null,
        document: req?.query?.document || req?.query?.cpf || req?.query?.cpfCnpj || null
      })
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
      const document = req.body?.document || req.body?.cpf || req.body?.cpfCnpj
      const { method } = req.body
      const methodNormalized = String(method || '').trim().toLowerCase()

      logger.info('Iniciando fluxo 2FA request-code', {
        tenant_id: req?.body?.tenant_id || null,
        method: methodNormalized,
        has_document: !!document
      })

      if (!document || !['email', 'sms'].includes(methodNormalized)) {
        return res.status(400).json({
          success: false,
          message: 'CPF/CNPJ e método (email ou sms) são obrigatórios'
        })
      }

      const tenant = await PasswordRecoveryController.resolveTenantFromRequest(req)
      if (!tenant || !tenant.usaAgente || !tenant.usaAgente()) {
        return res.status(400).json({
          success: false,
          message: 'Provedor sem integração com agente'
        })
      }

      const client = await PasswordRecoveryController.findClientByDocument(tenant, document)
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não localizado para o CPF/CNPJ'
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

      try {
        await PasswordRecoveryController.createClientLogin2FAToken({
          tenant,
          login,
          code: codigo,
          method: methodNormalized,
          contact: methodNormalized === 'email' ? recoveryEmail : recoveryPhone
        })
      } catch (tokenError) {
        logger.error('Falha ao criar token 2FA do cliente', {
          error: tokenError?.message || String(tokenError),
          stack: tokenError?.stack,
          tenant_id: tenant?._id || null,
          login,
          method: methodNormalized
        })
        return res.status(500).json({
          success: false,
          message: 'Erro ao gerar código de verificação',
          errorCode: 'TOKEN_CREATE_ERROR'
        })
      }

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
      const https = require('https')
      const { formatPhoneForSMS } = require('../utils/phone')

      const smsConfig = await PasswordRecoveryController.resolveSmsGatewayConfig(tenant)
      if (!smsConfig.enabled) {
        logger.warn('Configuração SMS desabilitada para 2FA', {
          tenant_id: tenant?._id || null,
          source: smsConfig?.source || 'unknown'
        })
        return res.status(500).json({ success: false, message: 'Sistema de SMS não configurado' })
      }

      const smsUrl = String(smsConfig.smsUrl || '').trim()
      const smsUser = String(smsConfig.smsUser || '').trim()
      const smsPassword = String(smsConfig.smsPassword || '').trim()
      const smsMethod = String(smsConfig.smsMethod || 'POST').trim().toUpperCase()
      const smsConfigSource = String(smsConfig.source || 'unknown')
      const smsConfigCanonicalHost = String(smsConfig.canonicalHost || '').trim().toLowerCase()

      logger.info('Configuração SMS resolvida para 2FA', {
        tenant_id: tenant?._id || null,
        source: smsConfigSource,
        endpoint_set: !!smsUrl,
        user_set: !!smsUser,
        method: smsMethod
      })

      if (!smsUrl || !smsUser || !smsPassword) {
        logger.warn('Configuração SMS incompleta para 2FA', {
          tenant_id: tenant?._id || null,
          source: smsConfigSource,
          endpoint_set: !!smsUrl,
          user_set: !!smsUser,
          password_set: !!smsPassword
        })
        return res.status(500).json({ success: false, message: 'Sistema de SMS não configurado' })
      }

      if (!['GET', 'POST'].includes(smsMethod)) {
        return res.status(500).json({
          success: false,
          message: 'Configuração SMS inválida: método deve ser GET ou POST',
          errorCode: 'SMS_CONFIG_INVALID_METHOD'
        })
      }

      const phoneFormatted = formatPhoneForSMS(recoveryPhone)
      const mensagem = `Seu código de login MK-Edge é: ${codigo}. Válido por 10 minutos.`
      const smsNumber = `55${phoneFormatted}`
      const legacyTlsCompatEnabled = String(process.env.SMS_TLS_INSECURE_COMPAT || 'true').toLowerCase() !== 'false'
      const smsGatewayTimeoutMs = Number(process.env.SMS_GATEWAY_TIMEOUT_MS || 10000)

      const normalizeSmsUrl = (rawUrl, canonicalHost = '') => {
        try {
          const parsed = new URL(rawUrl)
          const normalizedCanonicalHost = String(canonicalHost || '').trim().toLowerCase()
          const isMessengerHost = normalizedCanonicalHost && parsed.hostname.toLowerCase() === normalizedCanonicalHost
          const hasPath = parsed.pathname && parsed.pathname !== '/'

          if (isMessengerHost && !hasPath) {
            parsed.pathname = '/sms/index.php'
          }

          return parsed.toString()
        } catch {
          return rawUrl
        }
      }

      const sendSmsRequest = async (
        gatewayConfig,
        {
          allowInsecureTls = false,
          forceHttp = false,
          timeoutMs = smsGatewayTimeoutMs
        } = {}
      ) => {
        const rawUrl = String(gatewayConfig?.smsUrl || '').trim()
        const targetUrl = forceHttp
          ? rawUrl.replace(/^https:\/\//i, 'http://')
          : rawUrl
        const targetUser = String(gatewayConfig?.smsUser || '').trim()
        const targetPassword = String(gatewayConfig?.smsPassword || '').trim()
        const effectiveMethod = String(gatewayConfig?.smsMethod || 'POST').trim().toUpperCase()
        const targetParams = new URLSearchParams({
          u: targetUser,
          p: targetPassword,
          to: smsNumber,
          msg: mensagem,
          token: targetUser,
          celular: `+${smsNumber}`,
          mensagem
        })
        const useHttps = /^https:\/\//i.test(String(targetUrl || ''))
        const isKnownTlsIncompatibleGateway = /mk-messenger\.com\.br|172\.31\.255\.3/i.test(String(targetUrl || ''))
        const hostHeader = PasswordRecoveryController.resolveSmsGatewayHostHeader(targetUrl)
        const baseOptions = {
          timeout: timeoutMs,
          validateStatus: (status) => status < 500
        }

        if (hostHeader) {
          baseOptions.headers = {
            ...(baseOptions.headers || {}),
            Host: hostHeader
          }
        }

        // Aplicar httpsAgent sempre que allowInsecureTls for explícito (cobre redirects HTTP→HTTPS)
        // Para o caso padrão (legacyTlsCompatEnabled/isKnownTlsIncompatibleGateway) só aplica em URLs HTTPS diretas
        if (allowInsecureTls || ((legacyTlsCompatEnabled || isKnownTlsIncompatibleGateway) && useHttps)) {
          baseOptions.httpsAgent = new https.Agent({ rejectUnauthorized: false })
        }

        if (effectiveMethod === 'GET') {
          return axios.get(`${targetUrl}?${targetParams.toString()}`, baseOptions)
        }

        return axios.post(targetUrl, targetParams.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(baseOptions.headers || {})
          },
          ...baseOptions
        })
      }

      let activeSmsConfig = {
        source: smsConfigSource,
        smsUrl,
        smsUser,
        smsPassword,
        smsMethod,
        canonicalHost: smsConfigCanonicalHost
      }

      try {
        let smsResponse
        let usedInsecureTlsRetry = false
        const smsConfigCandidates = [activeSmsConfig]
        if (smsConfig?.fallback?.enabled) {
          smsConfigCandidates.push(smsConfig.fallback)
        }

        if (legacyTlsCompatEnabled && /^https:\/\//i.test(String(activeSmsConfig.smsUrl || ''))) {
          logger.warn('Compatibilidade TLS insegura para gateway SMS está ativa no 2FA', {
            tenant_id: tenant?._id || null,
            login,
            sms_url: activeSmsConfig.smsUrl,
            sms_method: activeSmsConfig.smsMethod
          })
        }

        for (const gatewayConfig of smsConfigCandidates) {
          const requestSmsUrl = normalizeSmsUrl(gatewayConfig.smsUrl, gatewayConfig.canonicalHost)
          const gatewayUrlCandidates = PasswordRecoveryController.buildSmsGatewayUrls(requestSmsUrl)
          const currentSmsMethod = String(gatewayConfig.smsMethod || 'POST').trim().toUpperCase()
          const gatewaySource = String(gatewayConfig.source || 'unknown')

          try {
            for (const gatewayUrlCandidate of gatewayUrlCandidates) {
              const isHttpsCandidate = /^https:\/\//i.test(String(gatewayUrlCandidate || ''))

              try {
                logger.info('Enviando 2FA SMS para gateway', {
                  tenant_id: tenant?._id || null,
                  source: gatewaySource,
                  sms_method: currentSmsMethod,
                  sms_url: gatewayUrlCandidate
                })

                smsResponse = await sendSmsRequest({
                  ...gatewayConfig,
                  smsUrl: gatewayUrlCandidate,
                  smsMethod: currentSmsMethod
                })

                activeSmsConfig = {
                  ...gatewayConfig,
                  smsUrl: gatewayUrlCandidate,
                  smsMethod: currentSmsMethod
                }
                break
              } catch (firstSmsError) {
                const tlsRetryCodes = [
                  'ERR_TLS_CERT_ALTNAME_INVALID',
                  'DEPTH_ZERO_SELF_SIGNED_CERT',
                  'SELF_SIGNED_CERT_IN_CHAIN',
                  'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
                ]
                const gatewayCode = PasswordRecoveryController.readSmsGatewayErrorCode(firstSmsError)
                const shouldRetryWithInsecureTls = tlsRetryCodes.includes(gatewayCode) || PasswordRecoveryController.hasTlsCertificateError(firstSmsError)

                if (shouldRetryWithInsecureTls && isHttpsCandidate) {
                  usedInsecureTlsRetry = true
                  logger.warn('TLS do gateway SMS inválido; retry mantendo URL original com rejectUnauthorized=false', {
                    tenant_id: tenant?._id || null,
                    login,
                    sms_url_original: gatewayConfig.smsUrl,
                    sms_url_retry: gatewayUrlCandidate,
                    sms_method: currentSmsMethod,
                    gateway_code: gatewayCode,
                    gateway_message: PasswordRecoveryController.readSmsGatewayErrorMessage(firstSmsError)
                  })

                  try {
                    smsResponse = await sendSmsRequest({
                      ...gatewayConfig,
                      smsUrl: gatewayUrlCandidate,
                      smsMethod: currentSmsMethod
                    }, { allowInsecureTls: true })

                    activeSmsConfig = {
                      ...gatewayConfig,
                      smsUrl: gatewayUrlCandidate,
                      smsMethod: currentSmsMethod
                    }
                    break
                  } catch (retryError) {
                    if (/^https:\/\//i.test(String(gatewayUrlCandidate || ''))) {
                      try {
                        logger.warn('Retry TLS inseguro falhou no 2FA; tentando gateway via HTTP', {
                          tenant_id: tenant?._id || null,
                          login,
                          sms_url_https: gatewayUrlCandidate,
                          sms_url_http: String(gatewayUrlCandidate || '').replace(/^https:\/\//i, 'http://'),
                          sms_method: currentSmsMethod,
                          gateway_code: PasswordRecoveryController.readSmsGatewayErrorCode(retryError),
                          gateway_message: PasswordRecoveryController.readSmsGatewayErrorMessage(retryError)
                        })

                        smsResponse = await sendSmsRequest({
                          ...gatewayConfig,
                          smsUrl: gatewayUrlCandidate,
                          smsMethod: currentSmsMethod
                        }, { forceHttp: true })

                        activeSmsConfig = {
                          ...gatewayConfig,
                          smsUrl: String(gatewayUrlCandidate || '').replace(/^https:\/\//i, 'http://'),
                          smsMethod: currentSmsMethod
                        }
                        break
                      } catch (httpFallbackError) {
                        retryError = httpFallbackError
                      }
                    }

                    const retryCode = PasswordRecoveryController.readSmsGatewayErrorCode(retryError)
                    const hasAnotherUrlCandidate = gatewayUrlCandidates[gatewayUrlCandidates.length - 1] !== gatewayUrlCandidate
                    if (hasAnotherUrlCandidate && (PasswordRecoveryController.isRetryableSmsGatewayCode(retryCode) || PasswordRecoveryController.hasTlsCertificateError(retryError))) {
                      logger.warn('Gateway SMS indisponível via domínio público no 2FA; tentando host privado', {
                        tenant_id: tenant?._id || null,
                        login,
                        sms_url_current: gatewayUrlCandidate,
                        sms_url_next: gatewayUrlCandidates[gatewayUrlCandidates.indexOf(gatewayUrlCandidate) + 1] || null,
                        sms_method: currentSmsMethod,
                        gateway_code: retryCode,
                        gateway_message: PasswordRecoveryController.readSmsGatewayErrorMessage(retryError)
                      })
                      continue
                    }

                    throw retryError
                  }
                }

                const hasAnotherUrlCandidate = gatewayUrlCandidates[gatewayUrlCandidates.length - 1] !== gatewayUrlCandidate
                if (hasAnotherUrlCandidate && (PasswordRecoveryController.isRetryableSmsGatewayCode(gatewayCode) || PasswordRecoveryController.hasTlsCertificateError(firstSmsError))) {
                  logger.warn('Gateway SMS indisponível via domínio público no 2FA; tentando host privado', {
                    tenant_id: tenant?._id || null,
                    login,
                    sms_url_current: gatewayUrlCandidate,
                    sms_url_next: gatewayUrlCandidates[gatewayUrlCandidates.indexOf(gatewayUrlCandidate) + 1] || null,
                    sms_method: currentSmsMethod,
                    gateway_code: gatewayCode,
                    gateway_message: PasswordRecoveryController.readSmsGatewayErrorMessage(firstSmsError)
                  })
                  continue
                }

                throw firstSmsError
              }
            }

            if (smsResponse) {
              break
            }
          } catch (firstSmsError) {
            const gatewayCode = PasswordRecoveryController.readSmsGatewayErrorCode(firstSmsError)
            if (PasswordRecoveryController.isRetryableSmsGatewayCode(gatewayCode) && gatewaySource !== 'integration' && smsConfigCandidates.length > 1) {
              logger.warn('Gateway SMS principal indisponível; tentando fallback local de integração', {
                tenant_id: tenant?._id || null,
                login,
                sms_url: requestSmsUrl,
                sms_method: currentSmsMethod,
                gateway_code: gatewayCode
              })
              continue
            }

            throw firstSmsError
          }
        }

        if (!smsResponse) {
          throw new Error('SMS_GATEWAY_UNAVAILABLE')
        }

        const { status, data } = smsResponse
        let gatewayAccepted = false
        let gatewayMessage = ''
        const requestSmsUrl = normalizeSmsUrl(activeSmsConfig.smsUrl, activeSmsConfig.canonicalHost)
        const smsMethodUsed = String(activeSmsConfig.smsMethod || smsMethod).trim().toUpperCase()

        if (status === 401) {
          gatewayMessage = 'Token de autenticação não fornecido no gateway SMS'
        } else if (status === 403) {
          gatewayMessage = 'Token de autenticação inválido no gateway SMS'
        } else if (status === 200) {
          if (typeof data === 'object' && data !== null) {
            if (data.success === false) {
              gatewayMessage = data.message || data.error || 'Gateway SMS rejeitou o envio'
            } else {
              gatewayAccepted = true
            }
          } else {
            // Alguns gateways retornam texto/HTML mesmo quando aceitam o envio.
            gatewayAccepted = true
          }
        } else {
          gatewayMessage = `Gateway SMS retornou HTTP ${status}`
        }

        if (!gatewayAccepted) {
          logger.warn('Gateway SMS rejeitou envio 2FA do cliente', {
            tenant_id: tenant?._id || null,
            login,
            sms_config_source: activeSmsConfig.source || smsConfigSource,
            sms_url: requestSmsUrl,
            sms_method: smsMethodUsed,
            tls_insecure_retry: usedInsecureTlsRetry,
            gateway_status: status,
            gateway_message: gatewayMessage,
            gateway_data: typeof data === 'string' ? data.slice(0, 400) : data
          })

          return res.status(502).json({
            success: false,
            message: 'Falha ao enviar SMS de verificação',
            errorCode: 'SMS_GATEWAY_REJECTED',
            gatewayStatus: status,
            gatewayReason: gatewayMessage
          })
        }
      } catch (smsError) {
        const gatewayStatus = smsError?.response?.status || null
        const gatewayReason = smsError?.code || smsError?.message || 'SMS_GATEWAY_UNAVAILABLE'
        const gatewayData = smsError?.response?.data
        const gatewayDataPreview = typeof gatewayData === 'string'
          ? gatewayData.slice(0, 400)
          : gatewayData

        logger.error('Falha no gateway SMS durante 2FA do cliente', {
          error: smsError?.message || String(smsError),
          stack: smsError?.stack,
          tenant_id: tenant?._id || null,
          login,
          sms_config_source: activeSmsConfig?.source || smsConfigSource,
          sms_url: activeSmsConfig?.smsUrl || smsUrl,
          sms_method: activeSmsConfig?.smsMethod || smsMethod,
          gateway_reason: gatewayReason,
          gateway_status: gatewayStatus,
          gateway_data: gatewayDataPreview
        })

        return res.status(502).json({
          success: false,
          message: 'Falha ao enviar SMS de verificação',
          errorCode: 'SMS_GATEWAY_ERROR',
          gatewayReason,
          gatewayStatus
        })
      }

      return res.json({ success: true, message: 'Código enviado por SMS' })
    } catch (error) {
      logger.error('Erro ao solicitar código 2FA do cliente', {
        error: error?.message || String(error),
        stack: error?.stack,
        tenant_id: req?.body?.tenant_id || null,
        document: req?.body?.document || req?.body?.cpf || req?.body?.cpfCnpj || null,
        method: req?.body?.method || null
      })
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
      const document = req.body?.document || req.body?.cpf || req.body?.cpfCnpj
      const { code } = req.body

      if (!document || !code) {
        return res.status(400).json({
          success: false,
          message: 'CPF/CNPJ e código são obrigatórios'
        })
      }

      const tenant = await PasswordRecoveryController.resolveTenantFromRequest(req)
      if (!tenant || !tenant.usaAgente || !tenant.usaAgente()) {
        return res.status(400).json({
          success: false,
          message: 'Provedor sem integração com agente'
        })
      }

      const client = await PasswordRecoveryController.findClientByDocument(tenant, document)
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não localizado para o CPF/CNPJ'
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
      logger.error('Erro ao validar código 2FA do cliente', {
        error: error?.message || String(error),
        stack: error?.stack,
        tenant_id: req?.body?.tenant_id || null,
        document: req?.body?.document || req?.body?.cpf || req?.body?.cpfCnpj || null
      })
      return res.status(500).json({
        success: false,
        message: 'Erro ao validar código de verificação'
      })
    }
  }
}

module.exports = PasswordRecoveryController
