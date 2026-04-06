/**
 * Routes - Sistema de Rotas
 * Nova API MK-Edge
 * Última atualização: 2026-01-27 17:30 - Correção de prefixos /api/ duplicados
 */

const express = require('express');
const routes = express.Router();
const LEGACY_BILLING_DOMAIN_SUFFIX = (process.env.LEGACY_BILLING_DOMAIN_SUFFIX || 'updata.com.br').toLowerCase();

// Controllers
const RequestController = require('./app/controllers/RequestController');
const DashboardController = require('./app/controllers/DashboardController');
const ClientController = require('./app/controllers/ClientController');
const SessionController = require('./app/controllers/SessionController');
const InvoiceController = require('./app/controllers/InvoiceController');
const SearchController = require('./app/controllers/SearchController');
const CTOController = require('./app/controllers/CTOController');
const MkAuthAgentService = require('./app/services/MkAuthAgentService');
const AuthController = require('./app/controllers/AuthController');
const InstallerController = require('./app/controllers/InstallerController');
const TenantController = require('./app/controllers/TenantController');
const PlanController = require('./app/controllers/PlanController');
const RegisterController = require('./app/controllers/RegisterController');
const TenantService = require('./app/services/TenantService');
const { tenantMiddleware, optionalTenantMiddleware } = require('./app/middlewares/tenantMiddleware');
const { authMiddleware } = require('./app/middlewares/authMiddleware');

const normalizeBaseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin;
  } catch {
    return '';
  }
};

const isLegacyUpdataOrigin = (value) => {
  const origin = String(value || '').trim().toLowerCase();
  return !!LEGACY_BILLING_DOMAIN_SUFFIX && origin.includes(LEGACY_BILLING_DOMAIN_SUFFIX);
};

const resolveOriginFromAgentUrl = (agentUrl) => {
  const raw = String(agentUrl || '').trim();
  if (!raw) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return '';
  }
};

const resolveTenantBillingBaseUrl = (tenant) => {
  const candidates = [
    normalizeBaseUrl(tenant?.provedor?.website),
    normalizeBaseUrl(tenant?.provedor?.dominio),
    resolveOriginFromAgentUrl(tenant?.agente?.url),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    return candidate;
  }

  return '';
};

const formatCurrencyBrl = (value) => {
  const numeric = Number.parseFloat(String(value ?? 0).replace(',', '.'));
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safeValue);
};

// ==================== ROTAS PÚBLICAS ====================

// ==================== ROTAS PÚBLICAS (SEM TENANT_ID) ====================

/**
 * Health check
 */
routes.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    service: 'Nova API MK-Edge',
    message: 'Servidor funcionando! Configure os controllers para habilitar as rotas completas'
  });
});

/**
 * Registrar novo tenant + admin user
 * POST /register
 * Público (sem autenticação)
 * Body: { nome, cnpj, email, telefone, admin_nome, admin_email, admin_telefone, senha, plan_slug, razao_social?, dominio? }
 * Response: { success, user_id, tenant_id, subscription_id }
 */
routes.post('/register', RegisterController.store);

/**
 * Listar planos públicos (sem autenticação)
 * GET /api/public/plans
 * Query params: dominio (opcional)
 */
routes.get('/api/public/plans', async (req, res) => {
  try {
    const Plan = require('./app/schemas/Plan');
    const Tenant = require('./app/schemas/Tenant');
    const { dominio } = req.query;

    let query = { ativo: true };
    
    // Se domínio foi fornecido, buscar o tenant e seus planos
    if (dominio) {
      const tenant = await Tenant.findOne({ 'provedor.dominio': dominio }).lean();
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'Domínio não encontrado'
        });
      }
      query.tenant_id = tenant._id;
    }

    const plans = await Plan.find(query)
      .select('_id nome descricao valor_mensal recursos ativo ordem')
      .sort({ ordem: 1 })
      .lean();

    return res.json({
      success: true,
      plans,
      total: plans.length
    });
  } catch (error) {
    console.error('Erro ao listar planos públicos:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar planos'
    });
  }
});

/**
 * Listar planos públicos (SEM /api prefix - para publicFetch)
 * GET /public/plans
 * Query params: dominio (opcional)
 * Se dominio for fornecido e existir, retorna planos desse tenant
 * Se dominio não existir ou não for fornecido, retorna TODOS os planos ativos
 */
routes.get('/public/plans', async (req, res) => {
  try {
    const Plan = require('./app/schemas/Plan');
    const Tenant = require('./app/schemas/Tenant');
    const { dominio } = req.query;

    let query = { ativo: true };
    
    // Se domínio foi fornecido, tentar buscar o tenant
    if (dominio) {
      const tenant = await Tenant.findOne({ 'provedor.dominio': dominio }).lean();
      
      if (tenant) {
        query.tenant_id = tenant._id;
      }
      // Se tenant não encontrado, retorna todos os planos ativos (sem filtro de tenant_id)
    }

    const plans = await Plan.find(query)
      .select('_id nome slug descricao valor_mensal periodo recursos destaque cor dias_trial limite_clientes recorrente ativo ordem')
      .sort({ destaque: -1, ordem: 1 })
      .lean();

    return res.json({
      success: true,
      plans,
      total: plans.length,
      tenant_name: 'MK-Edge',
      tenant_color_primary: '#667eea',
      tenant_color_secondary: '#764ba2'
    });
  } catch (error) {
    console.error('❌ Erro ao listar planos públicos:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar planos'
    });
  }
});

/**
 * Listar provedores públicos (SEM /api prefix - para app cliente)
 * GET /public/providers
 * Retorna formato compatível com providers.config.json: { providers: [...] }
 */
const listPublicProviders = async (req, res) => {
  try {
    const Tenant = require('./app/schemas/Tenant');

    const tenants = await Tenant.find({
      'provedor.ativo': { $ne: false },
      'assinatura.ativa': true,
      'agente.ativo': true,
      'agente.url': { $exists: true, $nin: [null, ''] },
      'agente.token': { $exists: true, $nin: [null, ''] }
    })
      .select('_id provedor agente assinatura')
      .sort({ 'provedor.nome': 1 })
      .lean();

    const providers = tenants.map((tenant) => {
      const primaryColor = tenant?.provedor?.cores?.primaria;

      return {
        id: String(tenant._id),
        name: String(tenant?.provedor?.nome || 'Provedor'),
        agentUrl: String(tenant?.agente?.url || ''),
        apiKey: String(tenant?.agente?.token || ''),
        logo: tenant?.provedor?.logo || null,
        primaryColor: primaryColor ? String(primaryColor) : 'verde',
        supportEmail: tenant?.provedor?.email ? String(tenant.provedor.email) : '',
        supportPhone: tenant?.provedor?.telefone ? String(tenant.provedor.telefone) : '',
        active: true
      };
    });

    return res.json({
      success: true,
      providers,
      total: providers.length
    });
  } catch (error) {
    console.error('❌ Erro ao listar provedores públicos:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar provedores',
      providers: []
    });
  }
};

routes.get('/public/providers', listPublicProviders);

/**
 * Listar provedores públicos (com /api prefix)
 * GET /api/public/providers
 */
routes.get('/api/public/providers', listPublicProviders);

/**
 * Info da API
 * GET /api/info ou /api/status
 */
const apiInfo = {
  name: 'Nova API MK-Edge',
  version: '2.0.0',
  description: 'API moderna com arquitetura baseada em agente',
  endpoints: {
    health: 'GET /health',
    info: 'GET /api/info',
    status: 'GET /api/status',
    auth: {
      adminLogin: 'POST /api/auth/admin/login',
      portalLogin: 'POST /api/auth/portal/login',
      verify: 'GET /api/auth/verify',
      logout: 'POST /api/auth/logout',
      me: 'GET /api/me'
    },
    tenants: 'GET /api/tenants',
    plans: 'GET /api/plans',
    sessions: 'POST /sessions',
    requests: 'POST /requests',
    dashboardStats: 'GET /dashboard/stats',
    client: 'GET /client/:id',
    invoices: 'GET /invoices/:client_id',
    search: 'GET /search',
    agentPing: 'GET /agent/ping'
  },
  agentUrl: process.env.AGENT_DEFAULT_URL || 'não configurado'
};

routes.get('/info', (req, res) => res.json(apiInfo));
routes.get('/status', (req, res) => res.json(apiInfo));

/**
 * Ping do agente MK-Auth
 * GET /agent/ping
 */
routes.get('/agent/ping', tenantMiddleware(), async (req, res) => {
  try {
    const ok = await MkAuthAgentService.ping(req.tenant);
    res.json({ agent: req.tenant.agente.url, ok });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Teste simples de query no agente
 * GET /agent/test
 */
routes.get('/agent/test', tenantMiddleware(), async (req, res) => {
  try {
    const result = await MkAuthAgentService.executeCustom(req.tenant, 'SELECT 1 AS ok', {});
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== SESSÕES ====================

/**
 * Login do cliente (App Mobile)
 * POST /sessions (montado como /api/sessions no app.js)
 * Body: { login, senha }
 */
routes.post('/sessions', tenantMiddleware(), SessionController.store);

// ==================== ROTAS DE AUTENTICAÇÃO ====================

/**
 * Login Admin
 * POST /auth/admin/login (montado como /api/auth/admin/login no app.js)
 * Body: { username, password }
 */
routes.post('/auth/admin/login', AuthController.loginAdmin);

/**
 * Login Portal (Tenant)
 * POST /auth/portal/login (montado como /api/auth/portal/login no app.js)
 * Body: { cnpj, password }
 */
routes.post('/auth/portal/login', AuthController.loginPortal);

/**
 * Logout
 * POST /auth/logout (montado como /api/auth/logout no app.js)
 */
routes.post('/auth/logout', AuthController.logout);

/**
 * Verificar Token
 * GET /auth/verify (montado como /api/auth/verify no app.js)
 * Headers: Authorization: Bearer {token}
 */
routes.get('/auth/verify', AuthController.verify);

/**
 * Obter dados do usuário logado
 * GET /me (montado como /api/me no app.js)
 * Headers: Authorization: Bearer {token}
 */
routes.get('/me', AuthController.me);

// ==================== ROTAS DE RECUPERAÇÃO DE SENHA ====================

const PasswordRecoveryController = require('./app/controllers/PasswordRecoveryController');

/**
 * Obter contatos mascarados
 * GET /api/auth/password-recovery/contacts?identifier=admin
 * Público - sem autenticação
 */
routes.get('/auth/password-recovery/contacts', PasswordRecoveryController.getContacts);

/**
 * Solicitar código via SMS
 * POST /api/auth/password-recovery/request-sms
 * Público - sem autenticação
 */
routes.post('/auth/password-recovery/request-sms', PasswordRecoveryController.requestSmsRecovery);

/**
 * Solicitar código via Email
 * POST /api/auth/password-recovery/request-email
 * Público - sem autenticação
 */
routes.post('/auth/password-recovery/request-email', PasswordRecoveryController.requestEmailRecovery);

/**
 * Solicitar código via WhatsApp
 * POST /api/auth/password-recovery/request-whatsapp
 * Público - sem autenticação
 */
routes.post('/auth/password-recovery/request-whatsapp', PasswordRecoveryController.requestWhatsappRecovery);

/**
 * Verificar código e resetar senha
 * POST /api/auth/password-recovery/verify-code
 * Público - sem autenticação
 */
routes.post('/auth/password-recovery/verify-code', PasswordRecoveryController.verifyCodeAndReset);

/**
 * Obter contatos para login 2FA do cliente
 * GET /api/auth/login-2fa/contacts?cpf=00000000000&tenant_id=...
 */
routes.get('/auth/login-2fa/contacts', PasswordRecoveryController.getClient2FAContacts);

/**
 * Solicitar código para login 2FA do cliente
 * POST /api/auth/login-2fa/request-code
 * Body: { cpf, method: 'email'|'sms', tenant_id }
 */
routes.post('/auth/login-2fa/request-code', PasswordRecoveryController.requestClient2FACode);

/**
 * Validar código para login 2FA do cliente
 * POST /api/auth/login-2fa/verify-code
 * Body: { cpf, code, tenant_id }
 */
routes.post('/auth/login-2fa/verify-code', PasswordRecoveryController.verifyClient2FACode);

// ==================== ROTAS DE TENANTS (ADMIN) ====================

console.log('🔧 Registrando rotas de tenants...');

/**
 * Listar todos os tenants
 * GET /api/tenants
 * Query params: page, limit, ativo, nome
 */
routes.get('/tenants', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.index(req, res);
});

/**
 * Buscar tenant por ID
 * GET /api/tenants/:id
 */
routes.get('/tenants/:id', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.show(req, res);
});

/**
 * Criar novo tenant
 * POST /api/tenants
 */
routes.post('/tenants', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.store(req, res);
});

/**
 * Atualizar tenant
 * PUT /api/tenants/:id
 */
routes.put('/tenants/:id', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.update(req, res);
});

/**
 * Deletar tenant
 * DELETE /api/tenants/:id
 */
routes.delete('/tenants/:id', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.destroy(req, res);
});

/**
 * GET /api/admin/tenants/:id/plans
 * Listar planos de um tenant específico (Admin)
 */
routes.get('/admin/tenants/:id/plans', optionalTenantMiddleware(), authMiddleware, async (req, res) => {
  try {
    const Plan = require('./app/schemas/Plan');
    const { id } = req.params;
    const { active_only } = req.query;

    const query = { tenant_id: id };
    if (active_only === 'true') {
      query.ativo = true;
    }

    const plans = await Plan.find(query).lean();

    res.json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Erro ao listar planos do tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar planos'
    });
  }
});

/**
 * GET /api/tenants/:id/portal/user
 * Obter usuário do portal de um tenant (Admin)
 */
routes.get('/tenants/:id/portal/user', authMiddleware, async (req, res) => {
  try {
    const User = require('./app/schemas/User');
    const { id } = req.params;

    const portalUser = await User.findOne({
      tenant_id: id,
      roles: 'portal'
    }).lean();

    if (!portalUser) {
      return res.json({
        success: true,
        user: null
      });
    }

    res.json({
      success: true,
      user: {
        login: portalUser.login,
        nome: portalUser.nome,
        ativo: portalUser.ativo
      }
    });
  } catch (error) {
    console.error('Erro ao buscar usuário portal:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuário'
    });
  }
});

/**
 * POST /api/tenants/:id/portal/reset-password
 * Resetar senha do usuário portal de um tenant (Admin)
 * Body opcional: { newPassword?: string, generate?: boolean }
 */
routes.post('/tenants/:id/portal/reset-password', authMiddleware, async (req, res) => {
  try {
    const User = require('./app/schemas/User');
    const { id } = req.params;
    const { newPassword, generate } = req.body || {};

    const portalUser = await User.findOne({
      tenant_id: id,
      roles: 'portal'
    });

    if (!portalUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuário portal não encontrado para este tenant'
      });
    }

    const generatedPassword = () => {
      const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$!%*?&';
      let pwd = '';
      for (let i = 0; i < 12; i += 1) {
        pwd += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return pwd;
    };

    const finalPassword = newPassword && String(newPassword).trim()
      ? String(newPassword).trim()
      : (generate ? generatedPassword() : null);

    if (!finalPassword) {
      return res.status(400).json({
        success: false,
        message: 'Informe newPassword ou use generate=true'
      });
    }

    // Salva senha em texto puro para ser hasheada pelo pre-save do schema User
    portalUser.senha = finalPassword;
    await portalUser.save();

    return res.json({
      success: true,
      message: 'Senha do portal resetada com sucesso',
      password: finalPassword
    });
  } catch (error) {
    console.error('Erro ao resetar senha do usuário portal:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao resetar senha do usuário portal'
    });
  }
});

// ==================== ROTAS DE INSTALADOR ====================

/**
 * GET /api/installer/script/:tenantId
 * Retorna script de instalação personalizado
 */
routes.get('/installer/script/:tenantId', (req, res) => 
  InstallerController.getPersonalizedScript(req, res)
);

/**
 * GET /api/installer/download/:tenantId
 * Faz download do instalador personalizado
 */
routes.get('/installer/download/:tenantId', (req, res) => 
  InstallerController.downloadInstaller(req, res)
);

// ==================== ROTAS DE PLANOS (ADMIN) ====================

console.log('🔧 Registrando rotas de planos...');

/**
 * Listar todos os planos de todos os tenants (Admin)
 * GET /api/admin/plans
 */
routes.get('/admin/plans', optionalTenantMiddleware(), authMiddleware, async (req, res) => {
  try {
    const Plan = require('./app/schemas/Plan');
    const Tenant = require('./app/schemas/Tenant');
    
    // Buscar todos os planos da collection plans
    const plans = await Plan.find({}).lean();
    
    // Buscar informações dos tenants para enriquecer os dados
    const tenantIds = [...new Set(plans.map(p => p.tenant_id.toString()))];
    const tenants = await Tenant.find({ _id: { $in: tenantIds } }).lean();
    
    // Criar um mapa de tenants para lookup rápido
    const tenantMap = {};
    tenants.forEach(t => {
      tenantMap[t._id.toString()] = t;
    });
    
    // Enriquecer planos com informações do tenant
    const enrichedPlans = plans.map(plan => ({
      ...plan,
      tenant_nome: tenantMap[plan.tenant_id.toString()]?.provedor?.nome || 'Desconhecido'
    }));
    
    // Ordenar por tenant e ordem
    enrichedPlans.sort((a, b) => {
      if (a.tenant_nome !== b.tenant_nome) {
        return a.tenant_nome.localeCompare(b.tenant_nome);
      }
      return (a.ordem || 0) - (b.ordem || 0);
    });
    
    return res.json({
      success: true,
      plans: enrichedPlans,
      total: enrichedPlans.length
    });
  } catch (error) {
    logger.error('Erro ao listar todos os planos:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar planos',
      error: error.message
    });
  }
});

/**
 * Listar todos os planos
 * GET /api/plans
 * Query params: active_only
 * Tenant é opcional - se fornecido, filtra por tenant
 */
routes.get('/plans', optionalTenantMiddleware(), authMiddleware, async (req, res) => {
  return PlanController.list(req, res);
});

/**
 * Buscar plano por ID
 * GET /api/plans/:planId
 */
routes.get('/plans/:planId', tenantMiddleware(), authMiddleware, async (req, res) => {
  return PlanController.show(req, res);
});

/**
 * Criar novo plano
 * POST /api/plans
 */
routes.post('/plans', tenantMiddleware(), authMiddleware, async (req, res) => {
  return PlanController.create(req, res);
});

/**
 * Atualizar plano
 * PUT /api/plans/:planId
 */
routes.put('/plans/:planId', tenantMiddleware(), authMiddleware, async (req, res) => {
  return PlanController.update(req, res);
});

/**
 * Deletar plano
 * DELETE /api/plans/:planId
 */
routes.delete('/plans/:planId', tenantMiddleware(), authMiddleware, async (req, res) => {
  return PlanController.delete(req, res);
});

// ==================== ROTAS DE FATURAS ====================

const InvoiceService = require('./app/services/InvoiceService');

/**
 * Listar pagamentos de provedores (Admin)
 * GET /api/admin/payments
 */
routes.get('/admin/payments', authMiddleware, async (req, res) => {
  try {
    const { tenant_id, metodo, data_inicio, data_fim, limit } = req.query;

    const result = await InvoiceService.listarPagamentosProvedores({
      tenant_id,
      metodo,
      data_inicio,
      data_fim,
      limit
    });

    res.json({
      success: true,
      total: result.total,
      payments: result.payments
    });
  } catch (error) {
    console.error('Erro ao listar pagamentos dos provedores:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar pagamentos'
    });
  }
});

/**
 * Listar faturas de um tenant
 * GET /api/invoices
 */
routes.get('/invoices', tenantMiddleware(), authMiddleware, async (req, res) => {
  try {
    const { tenant } = req;
    const { status, data_inicio, data_fim } = req.query;

    const filtros = {};
    if (status) filtros.status = status;
    if (data_inicio) filtros.data_inicio = data_inicio;
    if (data_fim) filtros.data_fim = data_fim;

    const invoices = await InvoiceService.listarFaturas(tenant._id, filtros);

    res.json({
      success: true,
      invoices
    });
  } catch (error) {
    console.error('Erro ao listar faturas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar faturas'
    });
  }
});

/**
 * Registrar pagamento manual de fatura
 * POST /api/invoices/:id/manual-payment
 */
routes.post('/invoices/:id/manual-payment', tenantMiddleware(), authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { data_pagamento, valor_pago, metodo, observacoes } = req.body;
    const { user } = req;

    const invoice = await InvoiceService.registrarPagamentoManual(
      id,
      { data_pagamento, valor_pago, metodo, observacoes },
      user._id
    );

    res.json({
      success: true,
      message: 'Pagamento registrado com sucesso',
      invoice
    });
  } catch (error) {
    console.error('Erro ao registrar pagamento manual:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao registrar pagamento'
    });
  }
});

/**
 * Webhook EFI - Receber notificação de pagamento
 * POST /api/webhooks/efi/payment
 */
routes.post('/webhooks/efi/payment', async (req, res) => {
  try {
    const { pix } = req.body;

    if (!pix || !pix.txid) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos'
      });
    }

    await InvoiceService.registrarPagamentoEFI(pix.txid, pix);

    res.json({
      success: true,
      message: 'Pagamento processado'
    });
  } catch (error) {
    console.error('Erro ao processar webhook EFI:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== ROTAS DE INTEGRAÇÕES (ADMIN) ====================

const EfiController = require('./app/controllers/EfiController');
const EmailController = require('./app/controllers/EmailController');
const SmsController = require('./app/controllers/SmsController');
const ZApiController = require('./app/controllers/ZApiController');

// Configurar multer para upload de certificados
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

console.log('🔧 Registrando rotas de integrações (EFI, Email, SMS, ZAPI)...');

/**
 * EFI/Gerencianet
 */
routes.get('/integrations/efi/config', optionalTenantMiddleware(), authMiddleware, (req, res) => EfiController.getConfig(req, res));
routes.post('/integrations/efi/config', optionalTenantMiddleware(), authMiddleware, (req, res) => EfiController.updateConfig(req, res));
routes.post('/integrations/efi/test', optionalTenantMiddleware(), authMiddleware, (req, res) => EfiController.testConnection(req, res));
routes.post('/integrations/efi/upload-certificate', optionalTenantMiddleware(), authMiddleware, upload.single('certificate'), (req, res) => EfiController.uploadCertificate(req, res));

/**
 * Email/SMTP
 */
routes.get('/integrations/email/config', optionalTenantMiddleware(), authMiddleware, (req, res) => EmailController.getConfig(req, res));
routes.post('/integrations/email/config', optionalTenantMiddleware(), authMiddleware, (req, res) => EmailController.updateConfig(req, res));
routes.post('/integrations/email/test', optionalTenantMiddleware(), authMiddleware, (req, res) => EmailController.test(req, res));

/**
 * SMS Gateway
 */
routes.get('/integrations/sms/config', optionalTenantMiddleware(), authMiddleware, (req, res) => SmsController.getConfig(req, res));
routes.post('/integrations/sms/config', optionalTenantMiddleware(), authMiddleware, (req, res) => SmsController.updateConfig(req, res));
routes.post('/integrations/sms/test', optionalTenantMiddleware(), authMiddleware, (req, res) => SmsController.testConnection(req, res));

/**
 * Z-API/WhatsApp
 */
routes.get('/integrations/zapi/config', optionalTenantMiddleware(), authMiddleware, (req, res) => ZApiController.getConfig(req, res));
routes.post('/integrations/zapi/config', optionalTenantMiddleware(), authMiddleware, (req, res) => ZApiController.saveConfig(req, res));
routes.post('/integrations/zapi/test', optionalTenantMiddleware(), authMiddleware, (req, res) => ZApiController.testConnection(req, res));

// ==================== ROTAS AUTENTICADAS ====================

console.log('🔧 Aplicando authMiddleware global para rotas seguintes...');

routes.use(authMiddleware);

/**
 * Listar chamados
 * POST /requests (montado como /api/requests no app.js)
 */
routes.post('/requests', RequestController.index);

/**
 * Chamados em atraso
 * GET /requests/overdue (montado como /api/requests/overdue no app.js)
 */
routes.get('/requests/overdue', RequestController.overdue);

/**
 * Carrega dados do formulário de novo chamado (por login)
 * GET /request/form/:login
 * ⚠️ DEVE ESTAR ANTES DE /request/:id/:request_type
 * Retorna: { opcoes: { tecnicos: [...], assuntos: [...] } }
 */
routes.get('/request/form/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { tenant } = req;
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  
  try {
    // Busca técnicos do banco via agente
    console.log(`📱 [Request.form] Carregando técnicos para clientId=${clientId}...`);
    let tecnicos = [];
    
    try {
      const tecnicos_result = await MkAuthAgentService.execute(
        tenant,
        'listarTecnicos'
      );
      
      if (tecnicos_result?.data && Array.isArray(tecnicos_result.data)) {
        tecnicos = tecnicos_result.data.map(t => ({
          value: t.id,
          label: t.nome
        }));
        console.log(`✅ [Request.form] ${tecnicos.length} técnicos carregados`);
      } else {
        console.warn(`⚠️ [Request.form] Nenhum técnico no resultado:`, tecnicos_result);
      }
    } catch (techError) {
      console.error(`❌ [Request.form] Erro ao buscar técnicos:`, techError.message);
      throw new Error(`Erro ao buscar técnicos: ${techError.message}`);
    }
    
    // Se nenhum técnico encontrado
    if (tecnicos.length === 0) {
      console.warn(`❌ [Request.form] Nenhum técnico encontrado`);
      return res.status(500).json({
        error: 'Nenhum técnico disponível',
        message: 'Não foi possível carregar a lista de técnicos'
      });
    }
    
    // Busca assuntos do banco (DISTINCT de sis_suporte dos últimos 3 meses)
    console.log(`📝 [Request.form] Carregando assuntos...`);
    let assuntos = [];
    
    try {
      const querySuporte = MkAuthAgentService.queries.buscarAssuntosDeSuporte();
      const suporteResult = await MkAuthAgentService.sendToAgent(
        tenant,
        querySuporte.sql,
        querySuporte.params
      );
      
      if (suporteResult?.data && Array.isArray(suporteResult.data)) {
        assuntos = suporteResult.data
          .map(a => a.assunto)
          .filter(a => a && a.trim().length > 0);
        console.log(`✅ [Request.form] ${assuntos.length} assuntos carregados de sis_suporte`);
      }
      
      // Se não encontrou, usar lista padrão
      if (assuntos.length === 0) {
        console.log(`⚠️ [Request.form] Nenhum assunto encontrado, usando padrão`);
        assuntos = [
          'Conexao',
          'Instalação',
          'Mudança de Endereço',
          'Mudança de Plano',
          'Suporte Técnico',
          'Cobrança',
          'Outro'
        ];
      }
    } catch (assuntosError) {
      console.warn(`⚠️ [Request.form] Erro ao buscar assuntos:`, assuntosError.message);
      console.log(`   Usando assuntos padrão como fallback`);
      assuntos = [
        'Conexao',
        'Instalação',
        'Mudança de Endereço',
        'Mudança de Plano',
        'Suporte Técnico',
        'Cobrança',
        'Outro'
      ];
    }
    
    return res.json({
      opcoes: {
        tecnicos,
        assuntos
      }
    });
    
  } catch (error) {
    console.error(`❌ [Request.form] Erro final:`, error.message);
    
    return res.status(500).json({
      error: 'Erro ao carregar dados do formulário',
      message: error.message
    });
  }
});

/**
 * Buscar chamado específico (formato legado)
 * GET /request/:id/:request_type
 */
routes.get('/request/:id/:request_type', RequestController.showLegacy);

/**
 * Atualizar chamado (fechar, mudar status, etc)
 * POST /request/:id
 * Body: { status, motivo_fechar, observacao, atendente, etc }
 */
routes.post('/request/:id', RequestController.update);

/**
 * Estatísticas do dashboard (portal)
 * GET /dashboard/stats (montado como /api/dashboard/stats no app.js)
 */
routes.get('/dashboard/stats', DashboardController.stats);

/**
 * Dashboard Admin - Estatísticas gerais
 * GET /admin/dashboard/stats (montado como /api/admin/dashboard/stats no app.js)
 */
routes.get('/admin/dashboard/stats', optionalTenantMiddleware(), authMiddleware, (req, res) => DashboardController.getAdminStats(req, res));

/**
 * Dashboard Admin - Alertas ativos
 * GET /admin/dashboard/alerts (montado como /api/admin/dashboard/alerts no app.js)
 */
routes.get('/admin/dashboard/alerts', optionalTenantMiddleware(), authMiddleware, (req, res) => DashboardController.getAlerts(req, res));

/**
 * Dashboard Admin - Saúde do sistema
 * GET /admin/dashboard/health (montado como /api/admin/dashboard/health no app.js)
 */
routes.get('/admin/dashboard/health', optionalTenantMiddleware(), authMiddleware, (req, res) => DashboardController.getSystemHealth(req, res));

/**
 * Buscar cliente
 * GET /client/:id
 */
routes.get('/client/:id', tenantMiddleware(), ClientController.showById);

/**
 * Atualizar cliente por login (PUT)
 * PUT /client/:login
 * Aceita tanto login (CPF/CNPJ) quanto ID
 */
routes.put('/client/:login', tenantMiddleware(), async (req, res) => {
  const { tenant } = req;
  const loginParam = String(req.params.login).trim();
  const updateData = req.body;
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  const logger = require('./logger');
  
  try {
    logger.info('[Client.update] Iniciando atualização', {
      loginParam
    });
    
    // Monta query UPDATE dinâmica
    const fields = [];
    const params = []; // Array posicional
    
    // Extrai e processa os campos
    let { 
      latitude, longitude, coordenadas,
      new_cto, caixa_herm,
      observacao, date, rem_obs,
      nome, email, celular, fone,
      endereco_res, numero_res, bairro_res, complemento_res,
      automac, plano
    } = updateData;
    
    // Processa coordenadas
    if ((latitude !== undefined && longitude !== undefined) || coordenadas !== undefined) {
      let coordStr = coordenadas;
      if (!coordStr && latitude !== undefined && longitude !== undefined) {
        coordStr = `${latitude},${longitude}`;
      }
      if (coordStr) {
        fields.push('coordenadas = ?');
        params.push(coordStr);
      }
    }
    
    // Processa CTO (aceita new_cto ou caixa_herm)
    if (new_cto !== undefined || caixa_herm !== undefined) {
      fields.push('caixa_herm = ?');
      params.push(new_cto || caixa_herm);
    }
    
    // Processa observação
    if (observacao !== undefined && ['sim', 'nao'].includes(observacao)) {
      fields.push('observacao = ?');
      params.push(observacao);
      
      // Processa data da observação (apenas data, sem hora)
      let dataFormatada = rem_obs;
      if (dataFormatada) {
        try {
          dataFormatada = new Date(dataFormatada).toISOString().slice(0, 10);
        } catch (err) {
          logger.warn('[Client.update] Erro ao normalizar rem_obs:', err);
        }
      }
      if (!dataFormatada && date) {
        try {
          dataFormatada = new Date(date).toISOString().slice(0, 10);
        } catch (err) {
          logger.warn('[Client.update] Erro ao parsear data:', err);
        }
      }
      
      if (dataFormatada) {
        fields.push('rem_obs = ?');
        params.push(dataFormatada);
      } else if (observacao === 'nao') {
        fields.push('rem_obs = NULL');
      }
    }
    
    // Processa campos pessoais
    if (nome !== undefined) {
      fields.push('nome = ?');
      params.push(nome);
    }
    if (email !== undefined) {
      fields.push('email = ?');
      params.push(email);
    }
    if (celular !== undefined) {
      fields.push('celular = ?');
      params.push(celular);
    }
    if (fone !== undefined) {
      fields.push('fone = ?');
      params.push(fone);
    }
    
    // Processa endereço
    if (endereco_res !== undefined) {
      fields.push('endereco_res = ?');
      params.push(endereco_res);
    }
    if (numero_res !== undefined) {
      fields.push('numero_res = ?');
      params.push(numero_res);
    }
    if (bairro_res !== undefined) {
      fields.push('bairro_res = ?');
      params.push(bairro_res);
    }
    if (complemento_res !== undefined) {
      fields.push('complemento_res = ?');
      params.push(complemento_res);
    }
    
    // Processa automac
    if (automac === true || automac === 'sim') {
      fields.push('mac = NULL');
      fields.push('automac = ?');
      params.push('sim');
    }
    
    // Processa plano
    if (plano !== undefined) {
      fields.push('plano = ?');
      params.push(plano);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({
        error: 'Nenhum campo para atualizar'
      });
    }
    
    // Tenta UPDATE com login primeiro
    const sqlLogin = `UPDATE sis_cliente SET ${fields.join(', ')} WHERE login = ?`;
    const sqlLoginParams = [...params, loginParam];
    
    console.log('📝 SQL:', sqlLogin);
    console.log('📊 Parâmetros:', sqlLoginParams);
    
    let result = await MkAuthAgentService.sendToAgent(
      tenant,
      sqlLogin,
      sqlLoginParams
    );
    
    console.log('✅ [Client.update] Resultado do agente:', result);
    
    // Busca os dados atualizados do cliente usando buscarClienteAuto
    let updatedClient = null;
    try {
      const clientResult = await MkAuthAgentService.buscarClienteAuto(tenant, loginParam);
      if (clientResult && clientResult.data && clientResult.data.length > 0) {
        updatedClient = clientResult.data[0];
        console.log('📦 [Client.update] Cliente após update:', {
          id: updatedClient.id,
          login: updatedClient.login,
          endereco_res: updatedClient.endereco_res,
          numero_res: updatedClient.numero_res,
          nome: updatedClient.nome
        });
      } else {
        console.warn('⚠️ [Client.update] Cliente não encontrado após update');
      }
    } catch (err) {
      console.warn('⚠️ [Client.update] Erro ao buscar cliente atualizado:', err.message);
    }
    
    logger.info('[Client.update] Cliente atualizado com sucesso', {
      loginParam,
      updatedFields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
      updatedClientFound: !!updatedClient
    });
    
    return res.json({
      success: true,
      message: `Cliente ${loginParam} atualizado com sucesso`,
      client_id: loginParam,
      updated_fields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
      client: updatedClient || undefined
    });
    
  } catch (error) {
    console.error('[Client.update]', error.message);
    
    return res.status(500).json({
      error: 'Erro ao atualizar cliente',
      message: error.message
    });
  }
});

/**
 * Atualizar cliente por login (POST)
 * POST /client/:login
 * Aceita tanto login (CPF/CNPJ) quanto ID
 */
routes.post('/client/:login', tenantMiddleware(), async (req, res) => {
  const { tenant } = req;
  const loginParam = String(req.params.login).trim();
  const updateData = req.body;
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  const logger = require('./logger');
  
  try {
    logger.info('[Client.update] Iniciando atualização via POST', {
      loginParam
    });
    
    // Monta query UPDATE dinâmica
    const fields = [];
    const params = []; // Array posicional
    
    // Extrai e processa os campos
    let { 
      latitude, longitude, coordenadas,
      new_cto, caixa_herm,
      observacao, date, rem_obs,
      nome, email, celular, fone,
      endereco_res, numero_res, bairro_res, complemento_res,
      automac, plano
    } = updateData;
    
    // Processa coordenadas
    if ((latitude !== undefined && longitude !== undefined) || coordenadas !== undefined) {
      let coordStr = coordenadas;
      if (!coordStr && latitude !== undefined && longitude !== undefined) {
        coordStr = `${latitude},${longitude}`;
      }
      if (coordStr) {
        fields.push('coordenadas = ?');
        params.push(coordStr);
      }
    }
    
    // Processa CTO (aceita new_cto ou caixa_herm)
    if (new_cto !== undefined || caixa_herm !== undefined) {
      fields.push('caixa_herm = ?');
      params.push(new_cto || caixa_herm);
    }
    
    // Processa observação
    if (observacao !== undefined && ['sim', 'nao'].includes(observacao)) {
      fields.push('observacao = ?');
      params.push(observacao);
      
      // Processa data da observação (apenas data, sem hora)
      let dataFormatada = rem_obs;
      if (dataFormatada) {
        try {
          dataFormatada = new Date(dataFormatada).toISOString().slice(0, 10);
        } catch (err) {
          logger.warn('[Client.update] Erro ao normalizar rem_obs:', err);
        }
      }
      if (!dataFormatada && date) {
        try {
          dataFormatada = new Date(date).toISOString().slice(0, 10);
        } catch (err) {
          logger.warn('[Client.update] Erro ao parsear data:', err);
        }
      }
      
      if (dataFormatada) {
        fields.push('rem_obs = ?');
        params.push(dataFormatada);
      } else if (observacao === 'nao') {
        fields.push('rem_obs = NULL');
      }
    }
    
    // Processa campos pessoais
    if (nome !== undefined) {
      fields.push('nome = ?');
      params.push(nome);
    }
    if (email !== undefined) {
      fields.push('email = ?');
      params.push(email);
    }
    if (celular !== undefined) {
      fields.push('celular = ?');
      params.push(celular);
    }
    if (fone !== undefined) {
      fields.push('fone = ?');
      params.push(fone);
    }
    
    // Processa endereço
    if (endereco_res !== undefined) {
      fields.push('endereco_res = ?');
      params.push(endereco_res);
    }
    if (numero_res !== undefined) {
      fields.push('numero_res = ?');
      params.push(numero_res);
    }
    if (bairro_res !== undefined) {
      fields.push('bairro_res = ?');
      params.push(bairro_res);
    }
    if (complemento_res !== undefined) {
      fields.push('complemento_res = ?');
      params.push(complemento_res);
    }
    
    // Processa automac
    if (automac === true || automac === 'sim') {
      fields.push('mac = NULL');
      fields.push('automac = ?');
      params.push('sim');
    }
    
    // Processa plano
    if (plano !== undefined) {
      fields.push('plano = ?');
      params.push(plano);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({
        error: 'Nenhum campo para atualizar'
      });
    }
    
    // Tenta UPDATE com login primeiro
    const updateParams = [...params, loginParam];
    let sql = `UPDATE sis_cliente SET ${fields.join(', ')} WHERE login = ?`;
    
    console.log('📝 SQL (tentativa 1 - login):', sql);
    console.log('📊 Parâmetros:', updateParams);
    
    let result = await MkAuthAgentService.sendToAgent(
      tenant,
      sql,
      updateParams
    );
    
    console.log('✅ [Client.update] Resultado do agente (tentativa 1):', result);
    
    // Se não atualizou, tenta com ID
    if (result.affected_rows === 0) {
      console.warn('⚠️ [Client.update] UPDATE com login falhou, tentando com ID');
      const idParams = [...params, parseInt(loginParam)];
      sql = `UPDATE sis_cliente SET ${fields.join(', ')} WHERE id = ?`;
      
      console.log('📝 SQL (tentativa 2 - id):', sql);
      console.log('📊 Parâmetros:', idParams);
      
      result = await MkAuthAgentService.sendToAgent(
        tenant,
        sql,
        idParams
      );
      
      console.log('✅ [Client.update] Resultado do agente (tentativa 2):', result);
    }
    
    // Busca os dados atualizados do cliente usando buscarClienteAuto
    let updatedClient = null;
    try {
      const fetchResult = await MkAuthAgentService.buscarClienteAuto(tenant, loginParam);
      console.log('📊 [Client.update] Fetch result:', fetchResult);
      
      if (fetchResult && fetchResult.data && fetchResult.data.length > 0) {
        updatedClient = fetchResult.data[0];
        console.log('📦 [Client.update] Cliente após update:', {
          id: updatedClient.id,
          login: updatedClient.login,
          nome: updatedClient.nome
        });
      } else {
        console.warn('⚠️ [Client.update] Cliente não encontrado após update');
      }
    } catch (err) {
      console.warn('⚠️ [Client.update] Erro ao buscar cliente atualizado:', err.message);
    }
    
    logger.info('[Client.update] Cliente atualizado com sucesso', {
      loginParam,
      updatedFields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
      updatedClientFound: !!updatedClient
    });
    
    return res.json({
      success: true,
      message: `Cliente ${loginParam} atualizado com sucesso`,
      client_id: loginParam,
      updated_fields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
      client: updatedClient || undefined
    });
    
  } catch (error) {
    console.error('[Client.update]', error.message);
    
    return res.status(500).json({
      error: 'Erro ao atualizar cliente',
      message: error.message
    });
  }
});

/**
 * Atualizar cliente (observação, etc)
 * POST /client/:id
 * Body: { action: "update_client", observacao: "sim"|"nao", date: ISO_DATE }
 */
routes.post('/client/:id', tenantMiddleware(), async (req, res) => {
  const { tenant } = req;
  const clientId = req.params.id;
  const updateData = req.body;
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  const logger = require('./logger');
  
  try {
    // Monta query UPDATE dinâmica (compatível com antigo-backend)
    const fields = [];
    const params = { id: clientId };
    
    // Extrai e processa os campos
    let { 
      latitude, longitude, coordenadas,
      new_cto, caixa_herm,
      observacao, date, rem_obs,
      nome, email, celular, fone,
      endereco_res, numero_res, bairro_res, complemento_res,
      automac, plano
    } = updateData;
    
    // Processa coordenadas
    if ((latitude !== undefined && longitude !== undefined) || coordenadas !== undefined) {
      let coordStr = coordenadas;
      if (!coordStr && latitude !== undefined && longitude !== undefined) {
        coordStr = `${latitude},${longitude}`;
      }
      if (coordStr) {
        fields.push('coordenadas = ?');
        params.coordenadas = coordStr;
      }
    }
    
    // Processa CTO (aceita new_cto ou caixa_herm)
    if (new_cto !== undefined || caixa_herm !== undefined) {
      fields.push('caixa_herm = ?');
      params.caixa_herm = new_cto || caixa_herm;
    }
    
    // Processa observação
    if (observacao !== undefined && ['sim', 'nao'].includes(observacao)) {
      fields.push('observacao = ?');
      params.observacao = observacao;
      
      // Processa data da observação (apenas data, sem hora)
      let dataFormatada = rem_obs;
      if (dataFormatada) {
        try {
          dataFormatada = new Date(dataFormatada).toISOString().slice(0, 10);
        } catch (err) {
          logger.warn('[Client.update] Erro ao normalizar rem_obs:', err);
        }
      }
      if (!dataFormatada && date) {
        try {
          dataFormatada = new Date(date).toISOString().slice(0, 10);
        } catch (err) {
          logger.warn('[Client.update] Erro ao parsear data:', err);
        }
      }
      
      if (dataFormatada) {
        fields.push('rem_obs = ?');
        params.rem_obs = dataFormatada;
      } else if (observacao === 'nao') {
        fields.push('rem_obs = NULL');
      }
    }
    
    // Processa campos pessoais
    if (nome !== undefined) {
      fields.push('nome = ?');
      params.nome = nome;
    }
    if (email !== undefined) {
      fields.push('email = ?');
      params.email = email;
    }
    if (celular !== undefined) {
      fields.push('celular = ?');
      params.celular = celular;
    }
    if (fone !== undefined) {
      fields.push('fone = ?');
      params.fone = fone;
    }
    
    // Processa endereço
    if (endereco_res !== undefined) {
      fields.push('endereco_res = ?');
      params.endereco_res = endereco_res;
    }
    if (numero_res !== undefined) {
      fields.push('numero_res = ?');
      params.numero_res = numero_res;
    }
    if (bairro_res !== undefined) {
      fields.push('bairro_res = ?');
      params.bairro_res = bairro_res;
    }
    if (complemento_res !== undefined) {
      fields.push('complemento_res = ?');
      params.complemento_res = complemento_res;
    }
    
    // Processa automac
    if (automac === true || automac === 'sim') {
      fields.push('mac = NULL');
      fields.push('automac = ?');
      params.automac = 'sim';
    }
    
    // Processa plano
    if (plano !== undefined) {
      fields.push('plano = ?');
      params.plano = plano;
    }
    
    if (fields.length === 0) {
      return res.status(400).json({
        error: 'Nenhum campo para atualizar'
      });
    }
    
    // Monta query com WHERE (suporta id ou login)
    let whereClause = 'WHERE id = ?';
    let whereValue = clientId;
    
    // Se clientId não é número, tenta como login
    if (isNaN(clientId)) {
      whereClause = 'WHERE login = ?';
      whereValue = clientId;
    }
    
    const sql = `UPDATE sis_cliente SET ${fields.join(', ')} ${whereClause}`;
    
    // Extrai valores na ordem dos fields
    const valores = [];
    fields.forEach(f => {
      if (f.includes('NULL')) {
        // Campo com NULL não precisa de valor
        return;
      }
      const fieldName = f.split(' = ')[0].trim();
      valores.push(params[fieldName]);
    });
    valores.push(whereValue);
    
    console.log('📝 SQL:', sql);
    console.log('📊 Parâmetros:', valores);
    
    const result = await MkAuthAgentService.sendToAgent(
      tenant,
      sql,
      valores
    );
    
    console.log('✅ [Client.update] Resultado do agente:', result);
    
    // Busca os dados atualizados do cliente (tenta login ou ID automaticamente)
    let updatedClient = null;
    try {
      const clientResult = await MkAuthAgentService.buscarClienteAuto(tenant, clientId);
      
      if (clientResult.data && clientResult.data.length > 0) {
        updatedClient = clientResult.data[0];
        console.log('📦 [Client.update] Cliente após update:', {
          endereco_res: updatedClient.endereco_res,
          numero_res: updatedClient.numero_res,
          nome: updatedClient.nome
        });
      }
    } catch (err) {
      console.warn('⚠️ [Client.update] Erro ao buscar cliente atualizado:', err.message);
    }
    
    logger.info('[Client.update] Cliente atualizado com sucesso', {
      clientId,
      updatedFields: Object.keys(updateData).filter(k => updateData[k] !== undefined)
    });
    
    return res.json({
      success: true,
      message: `Cliente ${clientId} atualizado com sucesso`,
      client_id: clientId,
      updated_fields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
      client: updatedClient || undefined
    });
    
  } catch (error) {
    console.error('[Client.update]', error.message);
    
    return res.status(500).json({
      error: 'Erro ao atualizar cliente',
      message: error.message
    });
  }
});

/**
 * CTOs (Caixas Hermétcas)
 * GET /cto/:latitude/:longitude - Busca CTOs próximas (raio ~350m)
 * GET /cto/:lat/:lng - Alias com lat/lng
 * GET /cto?cto_name=CTO-001 - Busca CTO específica
 */
routes.get('/cto/:latitude/:longitude', CTOController.index);
routes.get('/cto/:lat/:lng', CTOController.index);  // Alias com lat/lng
routes.get('/cto', CTOController.show);             // CTO específica

/**
 * Buscar dados do recibo manual por ID da fatura
 * GET /invoices/manual-receipt/:invoice_id
 */
routes.get('/invoices/manual-receipt/:invoice_id', tenantMiddleware(), authMiddleware, async (req, res) => {
  const invoiceId = String(req.params.invoice_id || '').trim();

  if (!invoiceId) {
    return res.status(400).json({ error: 'ID da fatura é obrigatório' });
  }

  try {
    const result = await MkAuthAgentService.sendToAgent(
      req.tenant,
      `
        SELECT
          l.id                           AS fatura_id,
          l.login                        AS cliente_login,
          l.status,
          l.obs,
          l.referencia,
          l.datavenc,
          l.datapag,
          l.valor,
          l.valorpag,
          l.remvalor,
          l.recibo,
          l.coletor,
          c.nome                         AS cliente_nome,
          c.cpf_cnpj                     AS cliente_cpf_cnpj,
          c.email                        AS cliente_email,
          c.fone                         AS cliente_fone,
          c.celular                      AS cliente_celular,
          p.nome                         AS provedor_nome,
          p.razao                        AS provedor_razao,
          p.cnpj                         AS provedor_cnpj,
          p.endereco                     AS provedor_endereco,
          p.bairro                       AS provedor_bairro,
          p.cidade                       AS provedor_cidade,
          p.estado                       AS provedor_estado,
          p.fone                         AS provedor_fone,
          p.site                         AS provedor_site
        FROM sis_lanc l
        LEFT JOIN sis_cliente c
               ON c.login = l.login
              AND c.cli_ativado = 's'
        CROSS JOIN sis_provedor p
        WHERE l.id = ?
          AND l.deltitulo = 0
        LIMIT 1
      `,
      [invoiceId]
    );

    const row = result?.data?.[0];
    if (!row) {
      return res.status(404).json({ error: 'Recibo não encontrado para esta fatura' });
    }

    return res.json({
      faturaId: String(row.fatura_id || invoiceId),
      clienteLogin: String(row.cliente_login || '-'),
      status: String(row.status || '-'),
      observacao: String(row.obs || '-'),
      referencia: String(row.referencia || '-'),
      vencimento: row.datavenc ? String(row.datavenc) : null,
      pagamentoEm: row.datapag ? String(row.datapag) : null,
      valor: formatCurrencyBrl(row.valor),
      valorPago: formatCurrencyBrl(row.valorpag != null && row.valorpag !== '' ? row.valorpag : row.valor),
      valorRemanescente: formatCurrencyBrl(row.remvalor),
      recibo: String(row.recibo || '-'),
      coletor: String(row.coletor || '-'),
      clienteNome: String(row.cliente_nome || 'Cliente'),
      clienteCpfCnpj: String(row.cliente_cpf_cnpj || '-'),
      clienteEmail: String(row.cliente_email || '-'),
      clienteFone: String(row.cliente_fone || '-'),
      clienteCelular: String(row.cliente_celular || '-'),
      provedorNome: String(row.provedor_nome || 'Provedor'),
      provedorRazao: String(row.provedor_razao || '-'),
      provedorCnpj: String(row.provedor_cnpj || '-'),
      provedorEndereco: String(row.provedor_endereco || '-'),
      provedorBairro: String(row.provedor_bairro || '-'),
      provedorCidade: String(row.provedor_cidade || '-'),
      provedorEstado: String(row.provedor_estado || '-'),
      provedorFone: String(row.provedor_fone || '-'),
      provedorSite: String(row.provedor_site || '-'),
    });
  } catch (error) {
    console.error('[Invoices][ManualReceipt]', error.message);
    return res.status(500).json({ error: 'Não foi possível gerar o recibo manual' });
  }
});

/**
 * Buscar HTML remoto de comprovante (recibo/boleto)
 * GET /invoices/receipt-html/:encoded_url
 * Faz fetch do HTML remoto com retry e headers apropriados
 */
routes.get('/invoices/receipt-html/:encoded_url', tenantMiddleware(), authMiddleware, async (req, res) => {
  try {
    const encodedUrl = String(req.params.encoded_url || '').trim();
    if (!encodedUrl) {
      return res.status(400).json({ error: 'URL é obrigatória' });
    }

    let receiptUrl;
    try {
      receiptUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
    } catch {
      receiptUrl = decodeURIComponent(encodedUrl);
    }

    if (!receiptUrl || !receiptUrl.startsWith('http')) {
      return res.status(400).json({ error: 'URL inválida' });
    }

    // Fetch com retry e headers apropriados
    let response;
    let lastError;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

        response = await fetch(receiptUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'MK-Edge-API/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          break;
        } else if (response.status === 403 || response.status === 401) {
          return res.status(403).json({ error: 'Acesso negado ao servidor remoto' });
        }

        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error.message;
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    if (!response || !response.ok) {
      console.error('[Invoices][ReceiptHtml] Erro no fetch:', lastError);
      return res.status(502).json({ error: 'Não foi possível acessar o recibo remoto' });
    }

    const html = await response.text();
    if (!String(html || '').trim()) {
      return res.status(404).json({ error: 'HTML vazio do servidor remoto' });
    }

    return res.json({ html });
  } catch (error) {
    console.error('[Invoices][ReceiptHtml]', error.message);
    return res.status(500).json({ error: 'Erro ao buscar recibo remoto' });
  }
});

/**
 * Buscar dados da NFCom para visualização DANFE-COM
 * GET /nfcom/by-uuid/:uuid_lanc
 * Retorna dados completos da NFCom (nfcom + provedor + cliente + itens + opcoes)
 */
routes.get('/nfcom/by-uuid/:uuid_lanc', tenantMiddleware(), authMiddleware, async (req, res) => {
  const uuidLanc = String(req.params.uuid_lanc || '').trim();

  if (!uuidLanc) {
    return res.status(400).json({ error: 'UUID da fatura é obrigatório' });
  }

  try {
    const MkAuthAgentService = require('./app/services/MkAuthAgentService');

    // 1. Buscar dados da NFCom e do tomador
    const nfcomResult = await MkAuthAgentService.sendToAgent(
      req.tenant,
      `
        SELECT
          n.uuid_nfcom,
          n.idmka,
          n.titulo,
          n.numero,
          n.serie,
          n.emissao,
          n.status,
          n.chave,
          n.protocolo,
          n.opcoes,
          n.itens,
          n.obs,
          l.login AS cliente_login,
          c.nome AS cliente_nome,
          c.cpf_cnpj AS cliente_cpf_cnpj,
          c.email AS cliente_email,
          c.fone AS cliente_fone,
          c.celular AS cliente_celular,
          c.endereco_res AS cliente_endereco,
          c.numero_res AS cliente_numero,
          c.complemento_res AS cliente_complemento,
          c.bairro_res AS cliente_bairro,
          c.cidade_res AS cliente_cidade,
          c.cep_res AS cliente_cep,
          p.nome AS provedor_nome,
          p.razao AS provedor_razao,
          p.cnpj AS provedor_cnpj,
          p.ie AS provedor_ie,
          p.endereco AS provedor_endereco,
          p.bairro AS provedor_bairro,
          p.cidade AS provedor_cidade,
          p.estado AS provedor_estado,
          p.cep AS provedor_cep,
          p.fone AS provedor_fone,
          p.site AS provedor_site
        FROM sis_nfcom n
        LEFT JOIN sis_lanc l
               ON l.uuid_lanc = n.titulo
        LEFT JOIN sis_cliente c
               ON c.login = l.login
        CROSS JOIN sis_provedor p
        WHERE n.titulo = ?
        LIMIT 1
      `,
      [uuidLanc]
    );

    const nfcomRow = nfcomResult?.data?.[0];
    if (!nfcomRow) {
      return res.status(404).json({ error: 'NFCom não encontrada para esta fatura' });
    }

    // 2. Parsear opcoes e itens (JSON)
    let opcoes = {};
    let itens = [];

    if (nfcomRow.opcoes) {
      try {
        opcoes = typeof nfcomRow.opcoes === 'string' ? JSON.parse(nfcomRow.opcoes) : nfcomRow.opcoes;
      } catch (e) {
        console.warn('[NFCOM] Erro ao parsear opcoes:', e.message);
        opcoes = {};
      }
    }

    if (nfcomRow.itens) {
      try {
        const parsedItens = typeof nfcomRow.itens === 'string' ? JSON.parse(nfcomRow.itens) : nfcomRow.itens;
        itens = Array.isArray(parsedItens)
          ? parsedItens
          : (parsedItens && typeof parsedItens === 'object' ? Object.values(parsedItens) : []);
      } catch (e) {
        console.warn('[NFCOM] Erro ao parsear itens:', e.message);
        itens = [];
      }
    }

    const clienteTextoNfcom = String(opcoes?.cliente || '').trim();
    const clienteNomeNfcom = String(
      opcoes?.cliente_nome || (clienteTextoNfcom.includes('|') ? clienteTextoNfcom.split('|').slice(1).join('|') : '')
    ).trim();
    const provedorCnpjNfcom = String(opcoes?.cnpj || '').trim();

    // 3. Retornar dados estruturados
    return res.json({
      nfcom: {
        uuid_nfcom: String(nfcomRow.uuid_nfcom || ''),
        idmka: String(nfcomRow.idmka || ''),
        numero: String(nfcomRow.numero || ''),
        serie: String(nfcomRow.serie || ''),
        chave: String(nfcomRow.chave || ''),
        emissao: nfcomRow.emissao ? String(nfcomRow.emissao) : null,
        status: String(nfcomRow.status || 'PROCESSAMENTO'),
        protocolo: String(nfcomRow.protocolo || ''),
        obs: String(nfcomRow.obs || ''),
        
        // Provedor
        provedor_nome: String(nfcomRow.provedor_nome || req.tenant?.provedor?.nome || 'Provedor'),
        provedor_razao: String(nfcomRow.provedor_razao || req.tenant?.provedor?.razao_social || req.tenant?.provedor?.nome || ''),
        provedor_cnpj: String(nfcomRow.provedor_cnpj || provedorCnpjNfcom || req.tenant?.provedor?.cnpj || ''),
        provedor_ie: String(nfcomRow.provedor_ie || ''),
        provedor_endereco: String(nfcomRow.provedor_endereco || ''),
        provedor_bairro: String(nfcomRow.provedor_bairro || ''),
        provedor_cidade: String(nfcomRow.provedor_cidade || ''),
        provedor_estado: String(nfcomRow.provedor_estado || ''),
        provedor_cep: String(nfcomRow.provedor_cep || ''),
        provedor_fone: String(nfcomRow.provedor_fone || req.tenant?.provedor?.telefone || ''),
        provedor_site: String(nfcomRow.provedor_site || req.tenant?.provedor?.website || ''),
        provedor_logo_url: String(req.tenant?.provedor?.logo || ''),

        // Cliente / tomador
        cliente_login: String(nfcomRow.cliente_login || ''),
        cliente_nome: String(nfcomRow.cliente_nome || clienteNomeNfcom || 'Não informado'),
        cliente_cpf_cnpj: String(nfcomRow.cliente_cpf_cnpj || ''),
        cliente_email: String(nfcomRow.cliente_email || ''),
        cliente_fone: String(nfcomRow.cliente_fone || ''),
        cliente_celular: String(nfcomRow.cliente_celular || ''),
        cliente_endereco: String(nfcomRow.cliente_endereco || ''),
        cliente_numero: String(nfcomRow.cliente_numero || ''),
        cliente_complemento: String(nfcomRow.cliente_complemento || ''),
        cliente_bairro: String(nfcomRow.cliente_bairro || ''),
        cliente_cidade: String(nfcomRow.cliente_cidade || ''),
        cliente_estado: String(nfcomRow.cliente_estado || ''),
        cliente_cep: String(nfcomRow.cliente_cep || ''),
      },
      opcoes,
      itens: Array.isArray(itens) ? itens : [],
    });
  } catch (error) {
    console.error('[NFCOM][ByUuid]', error.message);
    return res.status(500).json({ error: 'Erro ao buscar dados da NFCom' });
  }
});

/**
 * Renderizar HTML da DANFE-COM para visualização
 * GET /nfcom/html/:uuid_lanc
 * Retorna HTML pronto para visualizar/imprimir
 */
routes.get('/nfcom/html/:uuid_lanc', tenantMiddleware(), authMiddleware, async (req, res) => {
  const uuidLanc = String(req.params.uuid_lanc || '').trim();

  if (!uuidLanc) {
    return res.status(400).json({ error: 'UUID da fatura é obrigatório' });
  }

  try {
    const MkAuthAgentService = require('./app/services/MkAuthAgentService');

    // Buscar dados da NFCom, provedor e tomador
    const nfcomResult = await MkAuthAgentService.sendToAgent(
      req.tenant,
      `
        SELECT
          n.uuid_nfcom,
          n.idmka,
          n.titulo,
          n.numero,
          n.serie,
          n.emissao,
          n.status,
          n.chave,
          n.protocolo,
          n.opcoes,
          n.itens,
          n.obs,
          l.login AS cliente_login,
          c.nome AS cliente_nome,
          c.cpf_cnpj AS cliente_cpf_cnpj,
          c.email AS cliente_email,
          c.fone AS cliente_fone,
          c.celular AS cliente_celular,
          c.endereco_res AS cliente_endereco,
          c.numero_res AS cliente_numero,
          c.complemento_res AS cliente_complemento,
          c.bairro_res AS cliente_bairro,
          c.cidade_res AS cliente_cidade,
          c.cep_res AS cliente_cep,
          p.nome AS provedor_nome,
          p.razao AS provedor_razao,
          p.cnpj AS provedor_cnpj,
          p.ie AS provedor_ie,
          p.endereco AS provedor_endereco,
          p.bairro AS provedor_bairro,
          p.cidade AS provedor_cidade,
          p.estado AS provedor_estado,
          p.cep AS provedor_cep,
          p.fone AS provedor_fone,
          p.site AS provedor_site
        FROM sis_nfcom n
        LEFT JOIN sis_lanc l
               ON l.uuid_lanc = n.titulo
        LEFT JOIN sis_cliente c
               ON c.login = l.login
        CROSS JOIN sis_provedor p
        WHERE n.titulo = ?
        LIMIT 1
      `,
      [uuidLanc]
    );

    const nfcomRow = nfcomResult?.data?.[0];
    if (!nfcomRow) {
      return res.status(404).send('<h1>NFCom não encontrada</h1>');
    }

    // Parsear opcoes e itens
    let opcoes = {};
    let itens = [];

    if (nfcomRow.opcoes) {
      try {
        opcoes = typeof nfcomRow.opcoes === 'string' ? JSON.parse(nfcomRow.opcoes) : nfcomRow.opcoes;
      } catch (e) {
        opcoes = {};
      }
    }

    if (nfcomRow.itens) {
      try {
        const parsedItens = typeof nfcomRow.itens === 'string' ? JSON.parse(nfcomRow.itens) : nfcomRow.itens;
        itens = Array.isArray(parsedItens)
          ? parsedItens
          : (parsedItens && typeof parsedItens === 'object' ? Object.values(parsedItens) : []);
      } catch (e) {
        itens = [];
      }
    }

    const clienteTextoNfcom = String(opcoes?.cliente || '').trim();
    const clienteNomeNfcom = String(
      opcoes?.cliente_nome || (clienteTextoNfcom.includes('|') ? clienteTextoNfcom.split('|').slice(1).join('|') : '')
    ).trim();
    const provedorCnpjNfcom = String(opcoes?.cnpj || '').trim();

    // Helper functions
    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const formatarCPFCNPJ = (cpf_cnpj) => {
      if (!cpf_cnpj) return 'Não informado';
      const clean = cpf_cnpj.replace(/\D/g, '');
      if (clean.length === 11) {
        return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
      } else if (clean.length === 14) {
        return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      }
      return cpf_cnpj;
    };

    const formatarCEP = (cep) => {
      if (!cep) return '-';
      const clean = cep.replace(/\D/g, '');
      return clean.replace(/^(\d{5})(\d{3})$/, '$1-$2');
    };

    const formatarDataHora = (value) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    };

    const formatarPeriodoReferencia = (value) => {
      if (!value) return '-';
      const [inicio, fim] = String(value).split('|');
      const formatMesAno = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return String(dateStr);
        return date.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
      };
      const inicioFmt = formatMesAno(inicio);
      const fimFmt = formatMesAno(fim);
      return inicioFmt && fimFmt ? `${inicioFmt} a ${fimFmt}` : String(value);
    };

    const formatarValor = (value) => parseFloat(value || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const dataEmissao = formatarDataHora(nfcomRow.emissao || new Date());
    const dataAutorizacao = formatarDataHora(opcoes?.dhRecbto || nfcomRow.emissao);
    const periodoReferencia = formatarPeriodoReferencia(opcoes?.reftitulo);
    const ambienteNormalizado = String(opcoes?.ambiente || '').toUpperCase();
    const ambienteLabel = ambienteNormalizado.includes('HOMO') ? 'HOMOLOGAÇÃO' : 'PRODUÇÃO';
    const badgeAmbienteClass = ambienteNormalizado.includes('HOMO') ? 'badge-danger' : 'badge-success';

    const tenantBaseUrl = resolveTenantBillingBaseUrl(req.tenant);
    const providerLogoUrl = (() => {
      const explicitLogo = String(req.tenant?.provedor?.logo || '').trim();
      if (/^https?:\/\//i.test(explicitLogo)) {
        return explicitLogo;
      }
      if (explicitLogo && tenantBaseUrl) {
        return `${tenantBaseUrl}/${explicitLogo.replace(/^\/+/, '')}`;
      }
      return tenantBaseUrl ? `${tenantBaseUrl}/mkfiles/logo.jpg` : '';
    })();

    nfcomRow.provedor_nome = String(nfcomRow.provedor_nome || req.tenant?.provedor?.nome || 'Provedor');
    nfcomRow.provedor_razao = String(nfcomRow.provedor_razao || req.tenant?.provedor?.razao_social || nfcomRow.provedor_nome || 'Provedor');
    nfcomRow.provedor_cnpj = String(nfcomRow.provedor_cnpj || provedorCnpjNfcom || req.tenant?.provedor?.cnpj || '');
    nfcomRow.provedor_fone = String(nfcomRow.provedor_fone || req.tenant?.provedor?.telefone || '');
    nfcomRow.provedor_site = String(nfcomRow.provedor_site || req.tenant?.provedor?.website || '');
    nfcomRow.cliente_nome = String(nfcomRow.cliente_nome || clienteNomeNfcom || 'Não informado');

    const clienteEnderecoCompleto = [
      nfcomRow.cliente_endereco,
      nfcomRow.cliente_numero,
      nfcomRow.cliente_complemento,
    ].filter(Boolean).join(', ');

    // Gerar HTML
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DANFE-COM Nº ${escapeHtml(nfcomRow.numero)}/${escapeHtml(nfcomRow.serie)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            background: #ececec;
            padding: 8px;
            color: #1f1f1f;
            font-size: 11px;
            line-height: 1.35;
        }
        .container {
            width: 100%;
            max-width: 780px;
            margin: 0 auto;
            background: #f6f6f6;
            border: 1px solid #cfd5dc;
            padding: 6px;
        }
        .danfe-header {
            margin-bottom: 8px;
        }
        .header-row {
            display: flex;
            gap: 8px;
            align-items: stretch;
            flex-wrap: wrap;
        }
        .header-left,
        .header-center {
            background: #fff;
            border: 1px solid #d6dce3;
            border-radius: 6px;
        }
        .header-left {
            flex: 0 0 140px;
            text-align: center;
            padding: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .header-center {
            flex: 1;
            text-align: center;
            padding: 10px 12px;
        }
        .header-center h1 {
            font-size: 20px;
            color: #1f3f73;
            margin-bottom: 2px;
            letter-spacing: 0.5px;
        }
        .header-center .subtitle {
            font-size: 10px;
            color: #444;
        }
        .header-center .modelo {
            display: inline-block;
            margin-top: 8px;
            padding: 4px 12px;
            border-radius: 999px;
            background: #1f3f73;
            color: #fff;
            font-size: 10px;
            font-weight: 700;
        }
        .header-right {
            flex: 0 0 170px;
            background: #294a7a;
            border: 1px solid #1f3f68;
            border-radius: 6px;
            color: #fff;
            padding: 8px;
            text-align: center;
        }
        .qr-wrapper {
            display: flex;
            gap: 8px;
            margin-top: 8px;
            padding: 8px;
            background: #284a7b;
            border-radius: 6px;
            flex-wrap: wrap;
        }
        .qr-card,
        .barcode-card {
            background: #fff;
            border-radius: 6px;
            padding: 10px;
        }
        .qr-card {
            flex: 0 0 96px;
            text-align: center;
        }
        .barcode-card {
            flex: 1 1 320px;
            min-width: 0;
        }
        .section {
            border: 1px solid #d6dce3;
            margin-bottom: 6px;
            background: #fff;
            overflow: hidden;
            border-radius: 3px;
        }
        .section-title {
            background: #2e4665;
            color: #fff;
            padding: 4px 8px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
        }
        .section-content {
            background: #fff;
        }
        .info-row {
            display: flex;
            flex-wrap: wrap;
        }
        .info-field {
            flex: 1;
            min-width: 0;
            padding: 5px 8px;
            border-right: 1px solid #e3e7eb;
            border-bottom: 1px solid #e3e7eb;
            min-height: 42px;
        }
        .info-row:last-child .info-field {
            border-bottom: none;
        }
        .info-field:last-child {
            border-right: none;
        }
        .info-field.full-width {
            flex: 1 0 100%;
        }
        .info-label {
            display: block;
            font-size: 9px;
            color: #5d6670;
            text-transform: uppercase;
            margin-bottom: 2px;
        }
        .info-value {
            display: block;
            font-size: 12px;
            font-weight: 700;
            color: #1f1f1f;
            word-break: break-word;
        }
        .table {
            width: 100%;
            border-collapse: collapse;
        }
        .table th,
        .table td {
            border: 1px solid #d9dfe5;
            padding: 5px 6px;
            font-size: 11px;
        }
        .table th {
            background: #f1f3f5;
            text-align: left;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 9px;
            font-weight: 700;
        }
        .badge-success {
            background: #d8f0db;
            color: #1d6b2d;
            border: 1px solid #b8ddb9;
        }
        .badge-danger {
            background: #f8d7da;
            color: #7b2029;
            border: 1px solid #eab9bf;
        }
        .actions {
            display: flex;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
            padding: 10px 0 2px;
        }
        .action-btn {
            border: none;
            background: linear-gradient(180deg, #6a5ae0 0%, #5441d8 100%);
            color: #fff;
            border-radius: 6px;
            padding: 9px 16px;
            font-size: 12px;
            font-weight: 700;
            box-shadow: 0 1px 4px rgba(84, 65, 216, 0.25);
        }
        @media (max-width: 768px) {
            body { padding: 0; background: #fff; }
            .container { max-width: 100%; border: none; padding: 4px; }
            .header-left, .header-center, .header-right, .qr-card, .barcode-card { flex: 1 1 100%; }
            .info-field, .info-field.full-width { flex: 1 1 100% !important; width: 100% !important; border-right: none; }
            .table th, .table td { font-size: 10px; }
        }
        @media print {
            body { background: #fff; padding: 0; }
            .container { max-width: 100%; border: none; }
            .actions { display: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="danfe-header">
            <div class="header-row">
                <div class="header-left">
                    <div style="height: 78px; width: 128px; display: flex; align-items: center; justify-content: center; background: #fff; border-radius: 4px; overflow: hidden;">
                        ${providerLogoUrl ? `<img src="${escapeHtml(providerLogoUrl)}" alt="Logo do provedor" style="max-width: 100%; max-height: 74px; object-fit: contain;">` : `<span style="font-size: 16px; color: #666; font-weight: 700;">${escapeHtml(nfcomRow.provedor_nome || 'LOGO')}</span>`}
                    </div>
                </div>
                <div class="header-center">
                    <h1>DANFE-COM</h1>
                    <div class="subtitle">Documento Auxiliar da Nota Fiscal</div>
                    <div class="subtitle">Fatura de Serviço de Comunicação Eletrônica</div>
                    <div class="modelo">MODELO 62 / NFCom</div>
                </div>
                <div class="header-right">
                    <div style="font-size: 10px; opacity: 0.9; text-transform: uppercase; margin-bottom: 4px;">NF-e</div>
                    <div style="font-size: 28px; font-weight: 800; line-height: 1;">Nº ${escapeHtml(String(nfcomRow.numero).padStart(9, '0'))}</div>
                    <div style="font-size: 18px; font-weight: 700; margin-top: 3px;">SÉRIE ${escapeHtml(nfcomRow.serie)}</div>
                    <div style="margin-top: 10px; padding: 6px 8px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22); border-radius: 6px; font-size: 11px;">
                        📅 ${escapeHtml(dataEmissao)}
                    </div>
                </div>
            </div>
            ${nfcomRow.chave ? `
            <div class="qr-wrapper">
                <div class="qr-card">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(nfcomRow.chave)}"
                         alt="QR Code NFCom"
                         style="width: 82px; height: 82px; display: block; margin: 0 auto;">
                    <div style="font-size: 8px; color: #444; margin-top: 6px; line-height: 1.2;">
                        <strong>CONSULTE</strong><br>
                        dfe-portal.svrs.rs.gov.br
                    </div>
                </div>
                <div class="barcode-card">
                    <div style="text-align: center; padding: 8px 6px; background: #f2f4f7; border-radius: 4px; margin-bottom: 8px;">
                        <img src="https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(nfcomRow.chave)}&code=Code128&translate-esc=on&unit=Fit&dpi=96&imagetype=Gif&rotation=0&color=%23000000&bgcolor=%23ffffff"
                             alt="Código de Barras"
                             style="width: 96%; height: 34px; display: block; margin: 0 auto;">
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: #1f3f73; font-weight: 700; margin-bottom: 4px;">🔑 CHAVE DE ACESSO</div>
                        <div style="font-family: 'Courier New', monospace; font-size: 12px; font-weight: 700; letter-spacing: 2px; background: #f7f8fa; padding: 8px 10px; border-radius: 4px; display: inline-block; max-width: 100%;">${escapeHtml(nfcomRow.chave)}</div>
                        <div style="margin-top: 8px; display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;">
                            <span class="badge ${badgeAmbienteClass}">${escapeHtml(ambienteLabel)}</span>
                            <span class="badge badge-success">DOCUMENTO COM VALOR FISCAL</span>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>

        <!-- Prestador -->
        <div class="section">
            <div class="section-title">Prestador de Serviços de Comunicação</div>
            <div class="section-content">
                <div class="info-row">
                    <div class="info-field full-width">
                        <span class="info-label">Razão Social</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_razao || 'Não informado')}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-field full-width">
                        <span class="info-label">Nome Fantasia</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_nome || nfcomRow.provedor_razao || 'Não informado')}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-field" style="flex: 0 0 38%;">
                        <span class="info-label">CNPJ</span>
                        <span class="info-value">${escapeHtml(formatarCPFCNPJ(nfcomRow.provedor_cnpj))}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 28%;">
                        <span class="info-label">Inscrição Estadual</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_ie || 'ISENTO')}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 20%;">
                        <span class="info-label">Inscrição Municipal</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_im || '-')}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 14%;">
                        <span class="info-label">UF</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_estado || '-')}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-field" style="flex: 0 0 70%;">
                        <span class="info-label">Endereço</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_endereco || '-')}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 30%;">
                        <span class="info-label">Bairro</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_bairro || '-')}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-field" style="flex: 0 0 40%;">
                        <span class="info-label">Município</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_cidade || '-')}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 25%;">
                        <span class="info-label">CEP</span>
                        <span class="info-value">${escapeHtml(formatarCEP(nfcomRow.provedor_cep))}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 35%;">
                        <span class="info-label">Telefone</span>
                        <span class="info-value">${escapeHtml(nfcomRow.provedor_fone || '-')}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tomador -->
        <div class="section">
            <div class="section-title">Tomador do Serviço</div>
            <div class="section-content">
                <div class="info-row">
                    <div class="info-field full-width">
                        <span class="info-label">Nome/Razão Social</span>
                        <span class="info-value">${escapeHtml(nfcomRow.cliente_nome || 'Não informado')}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-field" style="flex: 0 0 34%;">
                        <span class="info-label">CPF/CNPJ</span>
                        <span class="info-value">${escapeHtml(formatarCPFCNPJ(nfcomRow.cliente_cpf_cnpj))}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 33%;">
                        <span class="info-label">Telefone</span>
                        <span class="info-value">${escapeHtml(nfcomRow.cliente_fone || '-')}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 33%;">
                        <span class="info-label">Celular</span>
                        <span class="info-value">${escapeHtml(nfcomRow.cliente_celular || '-')}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-field" style="flex: 0 0 70%;">
                        <span class="info-label">Endereço</span>
                        <span class="info-value">${escapeHtml(clienteEnderecoCompleto || 'Não informado')}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 30%;">
                        <span class="info-label">Bairro</span>
                        <span class="info-value">${escapeHtml(nfcomRow.cliente_bairro || '-')}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-field" style="flex: 0 0 40%;">
                        <span class="info-label">Município</span>
                        <span class="info-value">${escapeHtml(nfcomRow.cliente_cidade || '-')}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 25%;">
                        <span class="info-label">CEP</span>
                        <span class="info-value">${escapeHtml(formatarCEP(nfcomRow.cliente_cep))}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 35%;">
                        <span class="info-label">E-mail</span>
                        <span class="info-value">${escapeHtml(nfcomRow.cliente_email || '-')}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Itens -->
        <div class="section">
            <div class="section-title">Discriminação dos Serviços Prestados</div>
            <div class="section-content">
                <table class="table">
                    <thead>
                        <tr>
                            <th style="width: 70%;">Descrição do Serviço</th>
                            <th style="width: 15%; text-align: center;">Qtd.</th>
                            <th style="width: 15%; text-align: right;">Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itens.length > 0 ? itens.map(item => `
                        <tr>
                            <td>${escapeHtml(item.descricao || 'Serviço')}</td>
                            <td class="text-center">${escapeHtml(String(item.quantidade || 1))}</td>
                            <td class="text-right">${formatarValor(item.total || 0)}</td>
                        </tr>
                        `).join('') : '<tr><td colspan="3" class="text-center">Nenhum item encontrado</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Totais -->
        <div class="section">
            <div class="section-title">Valores Totais e Tributos</div>
            <div class="section-content">
                <div class="info-row">
                    <div class="info-field">
                        <span class="info-label">Valor dos Serviços</span>
                        <span class="info-value">R$ ${formatarValor(opcoes.total_itens || 0)}</span>
                    </div>
                    <div class="info-field">
                        <span class="info-label">Valor ICMS</span>
                        <span class="info-value">R$ ${formatarValor(opcoes.total_icms || 0)}</span>
                    </div>
                    <div class="info-field">
                        <span class="info-label">Valor PIS</span>
                        <span class="info-value">R$ ${formatarValor(opcoes.total_pis || 0)}</span>
                    </div>
                    <div class="info-field">
                        <span class="info-label">Valor COFINS</span>
                        <span class="info-value">R$ ${formatarValor(opcoes.total_cofins || 0)}</span>
                    </div>
                    <div class="info-field" style="background: #f6f7f9;">
                        <span class="info-label">Valor Total da NFCom</span>
                        <span class="info-value" style="font-size: 16px;">R$ ${formatarValor(opcoes.total_itens || 0)}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Status -->
        <div class="section">
            <div class="section-title">Dados Fiscais</div>
            <div class="section-content">
                <div class="info-row">
                    <div class="info-field" style="flex: 0 0 33%;">
                        <span class="info-label">Protocolo de Autorização</span>
                        <span class="info-value">${escapeHtml(nfcomRow.protocolo || 'Não autorizada')}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 22%;">
                        <span class="info-label">Data de Autorização</span>
                        <span class="info-value">${escapeHtml(dataAutorizacao)}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 25%;">
                        <span class="info-label">Período de Referência</span>
                        <span class="info-value">${escapeHtml(periodoReferencia)}</span>
                    </div>
                    <div class="info-field" style="flex: 0 0 20%;">
                        <span class="info-label">Status</span>
                        <span class="info-value">
                            ${nfcomRow.status === 'cancelado'
                                ? '<span class="badge badge-danger">Cancelada</span>'
                                : nfcomRow.protocolo
                                    ? '<span class="badge badge-success">Autorizada</span>'
                                    : '<span class="badge">Aguardando</span>'}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="actions">
            <button class="action-btn" onclick="window.print()">🖨️ Imprimir</button>
            <button class="action-btn" onclick="alert('Baixar XML indisponível nesta visualização')">📥 Baixar XML</button>
            <button class="action-btn" onclick="alert('Visualização XML indisponível nesta tela')">📄 Ver XML</button>
            <button class="action-btn" onclick="history.back()">✖ Fechar</button>
        </div>
    </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('[NFCOM][HTML]', error.message);
    res.status(500).send('<h1>Erro ao gerar DANFE-COM</h1>');
  }
});

/**
 * Buscar faturas por client_id
 * GET /invoices/:client_id
 * Retorna faturas com formato compatível com app (com boleto, pix, etc)
 * Formato: {observacao, rem_obs, invoices: {pending_invoices: [...], paid_invoices: [...]}}
 */
routes.get('/invoices/:client_id', tenantMiddleware(), authMiddleware, async (req, res) => {
  const clientIdOrLogin = req.params.client_id;
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  const crypto = require('crypto');
  
  try {
    // Validação: verifica se tenant está disponível
    if (!req.tenant) {
      logger.warn('[GET /invoices] Tentativa de acesso sem tenant configurado', {
        client_id: clientIdOrLogin,
        has_tenant: !!req.tenant
      });
      return res.json({
        observacao: 'nao',
        rem_obs: null,
        invoices: {
          pending_invoices: [],
          paid_invoices: []
        }
      });
    }
    
    // Tenta buscar o cliente para pegar o login - aceita login ou ID
    const clientResult = await MkAuthAgentService.buscarClienteAuto(req.tenant, clientIdOrLogin);
    const client = clientResult?.data?.[0];
    
    if (!client || !client.login) {
      // Retorna estrutura vazia se cliente não existe
      return res.json({
        observacao: 'nao',
        rem_obs: null,
        invoices: {
          pending_invoices: [],
          paid_invoices: []
        }
      });
    }
    
    const normalizedRemObs = MkAuthAgentService.normalizeRemObs(client.rem_obs);

    // ===== FATURAS PENDENTES (ABERTAS + VENCIDAS) =====
    const abertasQuery = MkAuthAgentService.queries.titulosAbertos(client.login);
    const abertasResult = await MkAuthAgentService.sendToAgent(req.tenant, abertasQuery.sql, abertasQuery.params);
    const faturasPendentes = (abertasResult.data || []).filter(fat => fat.id);
    
    const pendingInvoices = [];
    
    for (const fatura of faturasPendentes) {
      const titleDate = fatura.datavenc ? new Date(fatura.datavenc).toLocaleDateString('pt-BR') : null;
      const tenantUrl = resolveTenantBillingBaseUrl(req.tenant);
      
      // URL do boleto (formato antigo)
      const linkBoleto = tenantUrl
        ? `${tenantUrl}/boleto/boleto.hhvm?titulo=${fatura.id}&contrato=${client.login}`
        : '';
      
      // Formata linha digitável (remove formatação)
      const linhadig_limpa = (fatura.linhadig || '').replace(/[. ]/g, '');
      
      // Busca PIX se uuid_lanc existir
      let pixInfo = null;
      if (fatura.uuid_lanc) {
        try {
          const qrPixQuery = MkAuthAgentService.queries.buscarQrPix(fatura.uuid_lanc);
          const qrPixResult = await MkAuthAgentService.sendToAgent(req.tenant, qrPixQuery.sql, qrPixQuery.params);
          const qrPix = qrPixResult?.data?.[0];
          
          if (qrPix && qrPix.qrcode) {
            const qrhash = crypto.createHash('md5').update(qrPix.qrcode).digest('hex');
            const linkQrcode = tenantUrl ? `${tenantUrl}/boleto/qrcode/PIX.${qrhash}.png` : '';
            
            pixInfo = {
              qrcode: qrPix.qrcode,
              qrcode_hash: qrhash,
              qrcode_url: linkQrcode
            };
          }
        } catch (error) {
          console.error(`[Invoices] Erro ao buscar PIX para ${fatura.uuid_lanc}:`, error.message);
        }
      }
      
      // Monta estrutura da fatura (compatível com antigo)
      pendingInvoices.push({
        title: titleDate,
        content: {
          titulo: fatura.id,
          uuid_lanc: fatura.uuid_lanc,
          tipo: fatura.tipo || 'boleto',
          valor: String(fatura.valor || 0),
          status: fatura.status || 'aberto',
          descricao: fatura.obs || `Fatura ${titleDate}`,
          // Boleto
          boleto: {
            linhadig: linhadig_limpa,
            linhadig_formatada: fatura.linhadig,
            url: linkBoleto
          },
          // PIX (se disponível)
          pix: pixInfo
        }
      });
    }
    
    // ===== FATURAS PAGAS =====
    const pagasQuery = MkAuthAgentService.queries.titulosPagos(client.login);
    const pagasResult = await MkAuthAgentService.sendToAgent(req.tenant, pagasQuery.sql, pagasQuery.params);
    const faturasPagas = (pagasResult.data || []).filter(fat => fat.id);
    
    const paidInvoices = faturasPagas.map(fatura => {
      const titleDate = fatura.datavenc ? new Date(fatura.datavenc).toLocaleDateString('pt-BR') : null;
      const paidDate = fatura.datapag ? new Date(fatura.datapag).toLocaleDateString('pt-BR') : null;
      const tenantUrl = resolveTenantBillingBaseUrl(req.tenant);
      const uuidLanc = String(fatura.uuid_lanc || '').trim();
      const collectorRaw = String(fatura.coletor || '').trim();
      const collectorUrl =
        collectorRaw.startsWith('http://') || collectorRaw.startsWith('https://')
          ? collectorRaw
          : '';
      const receiptByContratoUrl =
        tenantUrl && uuidLanc && client.login
          ? `${tenantUrl}/central/recibo.hhvm?titulo=${encodeURIComponent(uuidLanc)}&contrato=${encodeURIComponent(client.login)}`
          : '';
      const receiptBoletoUrl =
        tenantUrl && uuidLanc
          ? `${tenantUrl}/boleto/recibo.hhvm?titulo=${encodeURIComponent(uuidLanc)}`
          : '';
      const fallbackReceiptUrl =
        tenantUrl && uuidLanc
          ? `${tenantUrl}/central/recibo.hhvm?titulo=${encodeURIComponent(uuidLanc)}`
          : '';
      const directReceiptUrl = collectorUrl && /recibo/i.test(collectorUrl) ? collectorUrl : '';
      const noteFiscalUrl = collectorUrl && !/recibo/i.test(collectorUrl) ? collectorUrl : '';
      
      return {
        title: titleDate,
        content: {
          titulo: fatura.id,
          uuid_lanc: fatura.uuid_lanc,
          tipo: fatura.tipo || 'boleto',
          valor: String(fatura.valor || 0),
          status: fatura.status || 'pago',
          descricao: fatura.obs || `Fatura ${titleDate}`,
          paidAt: paidDate,
          coletor: collectorRaw || null,
          receipt_url: directReceiptUrl || receiptByContratoUrl || receiptBoletoUrl || fallbackReceiptUrl || '',
          nota_fiscal_url: noteFiscalUrl || ''
        }
      };
    });
    
    return res.json({
      observacao: client.observacao,
      rem_obs: normalizedRemObs,
      invoices: {
        pending_invoices: pendingInvoices,
        paid_invoices: paidInvoices
      }
    });
    
  } catch (error) {
    console.error('[Invoices]', error.message);
    return res.json({
      observacao: 'nao',
      rem_obs: null,
      invoices: {
        pending_invoices: [],
        paid_invoices: []
      }
    });
  }
});

/**
 * Dar baixa em fatura (marcar como pago)
 * POST /invoice/pay
 * Body: {invoice_id, titulo, uuid_lanc, data_pagamento, formapag, valor_pago, acrescimo, multa_mora, desconto, observacao, insnext, excluir_efipay}
 */
routes.post('/invoice/pay', tenantMiddleware(), InvoiceController.payInvoice);

/**
 * Buscar conexões de um cliente por ID
 * GET /connections/:client_id
 * Retorna: Array direto de conexões formatadas
 * Formato: [{id, start_date, start_time, end_date, end_time, duration, upload, download}]
 */
routes.get('/connections/:client_id', async (req, res) => {
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  const clientIdOrLogin = req.params.client_id;
  
  try {
    // Tenta buscar o cliente para pegar o login - aceita login ou ID
    const clientResult = await MkAuthAgentService.buscarClienteAuto(req.tenant, clientIdOrLogin);
    const client = clientResult?.data?.[0];
    
    if (!client || !client.login) {
      console.log('[Connections] Cliente não encontrado:', clientIdOrLogin);
      return res.json([]); // Retorna array vazio se cliente não existe
    }
    
    console.log('[Connections] Buscando para login:', client.login);
    
    // Busca histórico de conexões
    const queryDef = MkAuthAgentService.queries.historicoConexoes(client.login, 50);
    const result = await MkAuthAgentService.sendToAgent(req.tenant, queryDef.sql, queryDef.params);
    
    // Resultado pode estar em data ou em rows
    let conexoes = result.data || result.rows || [];
    
    // Garante que é um array
    if (!Array.isArray(conexoes)) {
      console.error('[Connections] Não é array:', typeof conexoes);
      return res.json([]); // Retorna vazio se não for array
    }
    
    console.log('[Connections] Array com', conexoes.length, 'conexões');
    
    // Aplica transform function se definida na query (elemento por elemento)
    if (queryDef.transform && conexoes.length > 0) {
      console.log('[Connections] Aplicando transform em cada conexão...');
      try {
        conexoes = conexoes.map(queryDef.transform);
      } catch (transformError) {
        console.error('[Connections] Erro no transform:', transformError.message);
      }
    }
    
    console.log('[Connections] Retornando', conexoes.length, 'conexões formatadas');
    return res.json(conexoes);
    
  } catch (error) {
    console.error('[Connections] Erro:', error.message);
    return res.json([]);
  }
});

/**
 * Buscar histórico de chamados do cliente
 * GET /requests/history?client_id=XXX&sort_mode=DESC
 * Retorna: {opened_requests: [...], closed_requests: [...]}
 */
routes.get('/requests/history', async (req, res) => {
  const { client_id, sort_mode = 'DESC' } = req.query;
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  
  try {
    if (!client_id) {
      return res.json({
        opened_requests: [],
        closed_requests: []
      });
    }
    
    // Busca cliente para pegar o login - aceita login ou ID
    const clientResult = await MkAuthAgentService.buscarClienteAuto(req.tenant, client_id);
    const client = clientResult?.data?.[0];
    
    if (!client || !client.login) {
      return res.json({
        opened_requests: [],
        closed_requests: []
      });
    }
    
    // Busca chamados do cliente por login (usa listarChamados que filtra por login)
    const queryDef = MkAuthAgentService.queries.listarChamados({
      login: client.login,  // ✅ FILTRA por login
      isAdmin: true,
      tecnico: null,
      sortMode: sort_mode   // ✅ PASSA o sort_mode (DESC por padrão)
    });
    
    const result = await MkAuthAgentService.sendToAgent(req.tenant, queryDef.sql, queryDef.params);
    const chamados = result.data || [];
    
    // Garante que é um array
    if (!Array.isArray(chamados)) {
      console.error('[RequestsHistory] Resultado não é array');
      return res.json({
        opened_requests: [],
        closed_requests: []
      });
    }
    
    // Separa em abertos e fechados
    const openedRequests = [];
    const closedRequests = [];
    
    chamados.forEach(chamado => {
      const request = {
        id: chamado.id,
        chamado: chamado.id_chamado || String(chamado.id),
        nome: chamado.nome,
        data_visita: chamado.visita ? new Date(chamado.visita).toLocaleDateString('pt-BR') : null,
        visita: chamado.visita ? new Date(chamado.visita).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : null,
        assunto: chamado.assunto,
        status: chamado.status?.toLowerCase() || 'aberto'
      };
      
      // Adiciona campos específicos conforme o status
      if (chamado.status?.toLowerCase() === 'fechado') {
        request.tecnico = chamado.employee_name || chamado.tecnico;
        request.fechamento = chamado.fechamento || new Date().toISOString();
        request.login_atend = chamado.login_atend;
        closedRequests.push(request);
      } else {
        request.tecnico = chamado.employee_name || chamado.tecnico;
        request.atendente = chamado.atendente;
        openedRequests.push(request);
      }
    });
    
    // Buscar mensagens para todos os chamados (abertos e fechados)
    const todasRequisicoes = [...openedRequests, ...closedRequests];
    
    for (let ticket of todasRequisicoes) {
      try {
        const chamadoCompleto = await MkAuthAgentService.execute(
          req.tenant,
          'chamadoCompletoComMensagens',
          ticket.id
        );
        
        console.log('[RequestsHistory] Chamado', ticket.id, '- Retornou:', chamadoCompleto ? 'sim' : 'não', 'Mensagens:', chamadoCompleto?.[0]?.mensagens?.length || 0);
        
        if (chamadoCompleto && chamadoCompleto[0] && chamadoCompleto[0].mensagens && chamadoCompleto[0].mensagens.length > 0) {
          // As mensagens vêm em ordem DESC, então [0] é a última (mais recente)
          const ultimaMensagem = chamadoCompleto[0].mensagens[0];
          ticket.mensagens = chamadoCompleto[0].mensagens;
          ticket.atendente_ultima_nota = ultimaMensagem.atendente || null;
        }
      } catch (error) {
        console.warn('[RequestsHistory] Erro ao buscar mensagens do chamado', ticket.id, error.message);
      }
    }
    
    return res.json({
      opened_requests: openedRequests,
      closed_requests: closedRequests
    });
    
  } catch (error) {
    console.error('[RequestsHistory]', error.message);
    return res.json({
      opened_requests: [],
      closed_requests: []
    });
  }
});

/**
 * Busca global
 * GET /search
 */
routes.get('/search', SearchController.index);

/**
 * Busca clientes por status (bloqueado/observacao/normal) sem LIMIT
 * GET /search/by-status?status=blocked|observation|normal
 */
routes.get('/search/by-status', SearchController.byStatus);

/**
 * Criar novo chamado
 * POST /request
 * Body: { client_id, login, assunto, tecnico, prioridade, descricao, visita, login_atend }
 */
routes.post('/request', async (req, res) => {
  const { tenant } = req;
  const { client_id, login, assunto, tecnico, prioridade, msg, atendente, visita, login_atend } = req.body;
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  
  try {
    console.log('🔍 [DEBUG] Payload recebido:');
    console.log('   - client_id:', client_id);
    console.log('   - login:', login);
    console.log('   - atendente:', atendente);
    console.log('   - msg:', msg);
    
    // Validações
    if (!client_id || !login || !assunto || !tecnico || !prioridade) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando: client_id, login, assunto, tecnico, prioridade'
      });
    }
    
    // ✅ BUSCA: Nome do cliente + email + ramal - aceita login ou ID
    let nomeCliente = '';
    let emailCliente = null;
    let ramalCliente = null;
    try {
      const clienteResult = await MkAuthAgentService.buscarClienteAuto(tenant, client_id);
      const cliente = clienteResult?.data?.[0];
      if (cliente) {
        nomeCliente = cliente.nome || '';
        emailCliente = cliente.email || null;
        ramalCliente = cliente.ramal || null;
        console.log(`✅ Cliente encontrado: ${nomeCliente}`);
        console.log(`   - Email: ${emailCliente}`);
        console.log(`   - Ramal: ${ramalCliente}`);
      }
    } catch (clientError) {
      console.warn(`⚠️ Erro ao buscar cliente ${client_id}:`, clientError.message);
    }
    
    // ✅ USA o atendente fornecido no payload (não busca mais!)
    const nomeAtendente = atendente || 'App';
    const loginAtendenteReal = login_atend || login;
    
    console.log(`✅ Atendente a ser inserido: ${nomeAtendente}`);
    console.log(`✅ Login atendente: ${loginAtendenteReal}`);
    
    // Monta query INSERT para sis_suporte (SEM descricao - vai para sis_msg)
    const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const visitaFormatada = visita || agora; // Usa data fornecida ou agora
    
    // ✅ GERA o chamadoNumber (formato: ddMMyyHHmmss + milissegundos)
    const now = new Date();
    const padZero = (n) => String(n).padStart(2, '0');
    const dia = padZero(now.getDate());
    const mes = padZero(now.getMonth() + 1);
    const ano = padZero(now.getFullYear().toString().slice(-2));
    const hora = padZero(now.getHours());
    const minuto = padZero(now.getMinutes());
    const segundo = padZero(now.getSeconds());
    const ms = padZero(Math.floor(now.getMilliseconds() / 10)); // 2 dígitos dos milissegundos
    const chamadoNumber = `${dia}${mes}${ano}${hora}${minuto}${segundo}${ms}`;
    
    // ✅ GERA uuid_suporte (UUID v4)
    const crypto = require('crypto');
    const uuidSuporte = `${crypto.randomUUID()}`;
    
    console.log('🔢 Chamado number gerado:', chamadoNumber);
    console.log('🔐 UUID suporte gerado:', uuidSuporte);
    
    // ✅ CORREÇÃO: Adicionado uuid_suporte, email e ramal ao INSERT
    const sql = `INSERT INTO sis_suporte 
                 (login, nome, chamado, uuid_suporte, assunto, tecnico, prioridade, status, visita, abertura, login_atend, atendente, email, ramal)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const valores = [
      login,                           // login
      nomeCliente,                     // nome (do cliente buscado)
      chamadoNumber,                   // chamado (gerado acima)
      uuidSuporte,                     // uuid_suporte (gerado acima)
      assunto,                        // assunto
      parseInt(tecnico) || 0,         // tecnico (como número)
      prioridade,                     // prioridade
      'aberto',                       // status padrão
      visitaFormatada,                // visita
      agora,                          // abertura
      loginAtendenteReal,             // login_atend (do atendente ou do cliente)
      nomeAtendente,                  // atendente (nome buscado ou login)
      emailCliente,                   // email (do cliente)
      ramalCliente                    // ramal (do cliente)
    ];
    
    console.log('📝 SQL INSERT (sis_suporte):', sql);
    console.log('📊 Parâmetros:', valores);
    
    const result = await MkAuthAgentService.sendToAgent(
      tenant,
      sql,
      valores
    );
    
    console.log('✅ Chamado criado!', result);
    
    // ✅ Extrai o ID do chamado criado (pode vir como insert_id, id, ou lastInsertId)
    const chamadoRecordId = result?.insert_id || result?.lastInsertId || result?.id;
    console.log('🔍 [DEBUG] chamadoRecordId extraído:', chamadoRecordId);
    console.log('🔍 [DEBUG] Usando chamadoNumber já gerado:', chamadoNumber);
    
    // ✅ Se houver mensagem (msg), cria uma nota em sis_msg (igual MessageController.store)
    if (msg && msg.trim()) {
      console.log('📝 Criando mensagem inicial em sis_msg...');
      console.log('   - chamadoNumber:', chamadoNumber);
      console.log('   - msg:', msg.trim());
      
      // Mesmo padrão do MessageController.store()
      const camposMsg = ['chamado', 'msg', 'tipo'];
      const valoresMsg = [chamadoNumber, msg.trim(), 'mk-edge'];
      
      // Adiciona data
      camposMsg.push('msg_data');
      valoresMsg.push(agora);
      
      // ✅ Adiciona login (OBRIGATÓRIO)
      camposMsg.push('login');
      valoresMsg.push(login);
      
      // ✅ Adiciona atendente (OBRIGATÓRIO)
      camposMsg.push('atendente');
      valoresMsg.push(nomeAtendente);
      
      const placeholdersMsg = camposMsg.map(() => '?').join(', ');
      const sqlMsg = `INSERT INTO sis_msg (${camposMsg.join(', ')}) VALUES (${placeholdersMsg})`;
      
      console.log('📝 SQL INSERT (sis_msg):', sqlMsg);
      console.log('📊 Parâmetros:', valoresMsg);
      
      try {
        const msgResult = await MkAuthAgentService.sendToAgent(
          tenant,
          sqlMsg,
          valoresMsg
        );
        console.log('✅ Mensagem criada!', msgResult);
      } catch (msgError) {
        console.error('❌ ERRO ao criar mensagem:', msgError.message);
        console.error('   Stack:', msgError.stack);
        if (msgError.response) {
          console.error('   Resposta do agente:', msgError.response.data);
        }
        console.warn('⚠️ Erro ao criar mensagem inicial (não crítico):', msgError.message);
        // Não é crítico se falhar a mensagem - o chamado já foi criado
      }
    }
    
    return res.status(201).json({
      success: true,
      message: 'Chamado criado com sucesso',
      chamado: chamadoNumber,        // Número do chamado (ddMMyyHHmmss...)
      id: chamadoRecordId,           // ID do registro em sis_suporte
      uuid: uuidSuporte,             // UUID do chamado
      data: result
    });
    
  } catch (error) {
    console.error('[Request.create]', error.message);
    
    return res.status(500).json({
      error: 'Erro ao criar chamado',
      message: error.message
    });
  }
});

/**
 * Carrega dados do formulário de novo chamado
 * GET /requests/form-data
 * Retorna: { tecnicos: [...], planos: [...], tipos: [...], prioridades: [...], status: [...] }
 */
routes.get('/requests/form-data', RequestController.getFormData);

/**
 * Mensagens/Notas de Chamados
 * GET /messages?chamado=XXX - Listar notas
 * POST /messages?chamado=XXX - Adicionar nota
 */
const MessageController = require('./app/controllers/MessageController');
routes.get('/messages', authMiddleware, MessageController.show);
routes.post('/messages', authMiddleware, MessageController.store);

// ==================== ERRO 404 ====================

routes.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method,
    message: 'Esta rota ainda não foi implementada. Consulte GET / para ver rotas disponíveis'
  });
});

module.exports = routes;
