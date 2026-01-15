/**
 * Routes - Sistema de Rotas
 * Nova API MK-Edge
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
const MkAuthAgentService = require('./app/services/MkAuthAgentService');
const AuthController = require('./app/controllers/AuthController');
const InstallerController = require('./app/controllers/InstallerController');
const TenantController = require('./app/controllers/TenantController');
const PlanController = require('./app/controllers/PlanController');
const TenantService = require('./app/services/TenantService');

// ==================== MIDDLEWARES ====================

const tenantMiddleware = async (req, res, next) => {
  try {
    // Busca tenant_id da query, body ou usa padrão
    const tenantId = req.query.tenant_id || req.body?.tenant_id || req.headers['x-tenant-id'] || '63dd998b885eb427c8c51958';
    
    // Busca tenant real do MongoDB
    const tenant = await TenantService.findById(tenantId);
    
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant não encontrado',
        tenant_id: tenantId
      });
    }
    
    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('Erro ao carregar tenant:', error.message);
    return res.status(500).json({
      error: 'Erro ao carregar configurações do provedor',
      message: error.message
    });
  }
};

const authMiddleware = (req, res, next) => {
  // TODO: Implementar validação de autenticação
  // Por enquanto, aceita qualquer requisição
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    // Token presente, continua
    req.user = { id: 'mock-user' };
    req.tenant_id = req.query.tenant_id || req.body?.tenant_id;
  }
  
  next();
};

// ==================== ROTAS PÚBLICAS ====================

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

routes.get('/api/info', (req, res) => res.json(apiInfo));
routes.get('/api/status', (req, res) => res.json(apiInfo));
/**
 * Ping do agente MK-Auth
 * GET /agent/ping
 */
routes.get('/agent/ping', tenantMiddleware, async (req, res) => {
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
routes.get('/agent/test', tenantMiddleware, async (req, res) => {
  try {
    const result = await MkAuthAgentService.executeCustom(req.tenant, 'SELECT 1 AS ok', {});
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== SESSÕES ====================

/**
 * Login do cliente
 * POST /sessions
 */
routes.post('/sessions', tenantMiddleware, SessionController.store);

// ==================== ROTAS DE AUTENTICAÇÃO ====================

/**
 * Login Admin
 * POST /api/auth/admin/login
 * Body: { username, password }
 */
routes.post('/api/auth/admin/login', AuthController.loginAdmin);

/**
 * Login Portal (Tenant)
 * POST /api/auth/portal/login
 * Body: { cnpj, password }
 */
routes.post('/api/auth/portal/login', AuthController.loginPortal);

/**
 * Logout
 * POST /api/auth/logout
 */
routes.post('/api/auth/logout', AuthController.logout);

/**
 * Verificar Token
 * GET /api/auth/verify
 * Headers: Authorization: Bearer {token}
 */
routes.get('/api/auth/verify', AuthController.verify);

/**
 * Obter dados do usuário logado
 * GET /api/me
 * Headers: Authorization: Bearer {token}
 */
routes.get('/api/me', AuthController.me);

// ==================== ROTAS DE TENANTS (ADMIN) ====================

/**
 * Listar todos os tenants
 * GET /api/tenants
 * Query params: page, limit, ativo, nome
 */
routes.get('/api/tenants', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.index(req, res);
});

/**
 * Buscar tenant por ID
 * GET /api/tenants/:id
 */
routes.get('/api/tenants/:id', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.show(req, res);
});

/**
 * Criar novo tenant
 * POST /api/tenants
 */
routes.post('/api/tenants', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.store(req, res);
});

/**
 * Atualizar tenant
 * PUT /api/tenants/:id
 */
routes.put('/api/tenants/:id', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.update(req, res);
});

/**
 * Deletar tenant
 * DELETE /api/tenants/:id
 */
routes.delete('/api/tenants/:id', authMiddleware, async (req, res) => {
  const tenantController = new TenantController();
  return tenantController.destroy(req, res);
});

// ==================== ROTAS DE INSTALADOR ====================

/**
 * GET /api/installer/script/:tenantId
 * Retorna script de instalação personalizado
 */
routes.get('/api/installer/script/:tenantId', (req, res) => 
  InstallerController.getPersonalizedScript(req, res)
);

/**
 * GET /api/installer/download/:tenantId
 * Faz download do instalador personalizado
 */
routes.get('/api/installer/download/:tenantId', (req, res) => 
  InstallerController.downloadInstaller(req, res)
);

// ==================== ROTAS DE PLANOS (ADMIN) ====================

/**
 * Listar todos os planos
 * GET /api/plans
 * Query params: active_only
 */
routes.get('/api/plans', tenantMiddleware, authMiddleware, async (req, res) => {
  const planController = new PlanController();
  return planController.list(req, res);
});

/**
 * Buscar plano por ID
 * GET /api/plans/:planId
 */
routes.get('/api/plans/:planId', tenantMiddleware, authMiddleware, async (req, res) => {
  const planController = new PlanController();
  return planController.show(req, res);
});

/**
 * Criar novo plano
 * POST /api/plans
 */
routes.post('/api/plans', tenantMiddleware, authMiddleware, async (req, res) => {
  const planController = new PlanController();
  return planController.create(req, res);
});

/**
 * Atualizar plano
 * PUT /api/plans/:planId
 */
routes.put('/api/plans/:planId', tenantMiddleware, authMiddleware, async (req, res) => {
  const planController = new PlanController();
  return planController.update(req, res);
});

/**
 * Deletar plano
 * DELETE /api/plans/:planId
 */
routes.delete('/api/plans/:planId', tenantMiddleware, authMiddleware, async (req, res) => {
  const planController = new PlanController();
  return planController.destroy(req, res);
});

// ==================== ROTAS AUTENTICADAS ====================

routes.use(tenantMiddleware);
routes.use(authMiddleware);

/**
 * Listar chamados
 * POST /requests
 */
routes.post('/requests', RequestController.index);

/**
 * Chamados em atraso
 * GET /requests/overdue
 */
routes.get('/requests/overdue', RequestController.overdue);

/**
 * Buscar chamado específico (formato legado)
 * GET /request/:id/:request_type
 */
routes.get('/request/:id/:request_type', RequestController.showLegacy);

/**
 * Estatísticas do dashboard
 * GET /dashboard/stats
 */
routes.get('/dashboard/stats', DashboardController.stats);

/**
 * Buscar cliente
 * GET /client/:id
 */
routes.get('/client/:id', ClientController.showById);

/**
 * Buscar faturas por client_id
 * GET /invoices/:client_id
 * Retorna faturas com formato compatível com app (com boleto, pix, etc)
 * Formato: {observacao, rem_obs, invoices: {pending_invoices: [...], paid_invoices: [...]}}
 */
routes.get('/invoices/:client_id', async (req, res) => {
  const clientIdOrLogin = req.params.client_id;
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  const crypto = require('crypto');
  
  try {
    // Tenta buscar o cliente para pegar o login
    const clientResult = await MkAuthAgentService.execute(req.tenant, 'buscarCliente', clientIdOrLogin);
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
      rem_obs: client.rem_obs,
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
 * Buscar conexões de um cliente por ID
 * GET /connections/:client_id
 * Retorna: Array direto de conexões formatadas
 * Formato: [{id, start_date, start_time, end_date, end_time, duration, upload, download}]
 */
routes.get('/connections/:client_id', async (req, res) => {
  const MkAuthAgentService = require('./app/services/MkAuthAgentService');
  const clientIdOrLogin = req.params.client_id;
  
  try {
    // Tenta buscar o cliente para pegar o login
    const clientResult = await MkAuthAgentService.execute(req.tenant, 'buscarCliente', clientIdOrLogin);
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
    
    // Busca cliente para pegar o login
    const clientResult = await MkAuthAgentService.execute(req.tenant, 'buscarCliente', client_id);
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
      tecnico: null
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
        request.fechamento = chamado.data_fechamento || new Date().toISOString();
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
