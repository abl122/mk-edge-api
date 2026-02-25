/**
 * Routes - Sistema de Rotas
 * Nova API MK-Edge
 * Última atualização: 2026-01-27 17:30 - Correção de prefixos /api/ duplicados
 */

const express = require('express');
const routes = express.Router();

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
 * Dashboard Admin - Atividades recentes
 * GET /admin/dashboard/activities (montado como /api/admin/dashboard/activities no app.js)
 */
routes.get('/admin/dashboard/activities', optionalTenantMiddleware(), authMiddleware, (req, res) => DashboardController.getActivities(req, res));

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
 * Dashboard Admin - Criar atividade
 * POST /admin/dashboard/activity (montado como /api/admin/dashboard/activity no app.js)
 */
routes.post('/admin/dashboard/activity', optionalTenantMiddleware(), authMiddleware, DashboardController.createActivity);

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
      const tenantUrl = process.env.TENANT_URL || 'https://provedor.updata.com.br';
      
      // URL do boleto (formato antigo)
      const linkBoleto = `${tenantUrl}/boleto/boleto.hhvm?titulo=${fatura.id}&contrato=${client.login}`;
      
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
            const linkQrcode = `${tenantUrl}/boleto/qrcode/PIX.${qrhash}.png`;
            
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
      
      return {
        title: titleDate,
        content: {
          titulo: fatura.id,
          uuid_lanc: fatura.uuid_lanc,
          tipo: fatura.tipo || 'boleto',
          valor: String(fatura.valor || 0),
          status: fatura.status || 'pago',
          descricao: fatura.obs || `Fatura ${titleDate}`,
          paidAt: paidDate
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
