/**
 * RequestController - Gerenciamento de Chamados/Solicitações
 * 
 * Implementa a camada de controle para chamados técnicos, suporte,
 * instalações, mudanças de endereço, etc.
 * 
 * Utiliza MkAuthAgentService para consultar dados do MK-Auth via agente PHP.
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

class RequestController {
  /**
   * Lista chamados com filtros
   * GET /requests
   * POST /requests
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      const { date, tecnico, isAdmin, summaryOnly } = req.body;  // POST usa body
      
      // Verifica se tenant usa agente
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Se summaryOnly=true, retorna apenas contadores por status (compatibilidade com antigo)
      if (summaryOnly) {
        const [todayResult, overdueResult, ongoingResult, completedResult] = await Promise.all([
          MkAuthAgentService.execute(tenant, 'dashboardChamadosHoje', { tecnico, isAdmin }),
          MkAuthAgentService.execute(tenant, 'dashboardChamadosAtrasados', { tecnico, isAdmin }),
          MkAuthAgentService.execute(tenant, 'dashboardChamadosEmAndamento', { tecnico, isAdmin }),
          MkAuthAgentService.execute(tenant, 'dashboardChamadosConcluidos', { tecnico, isAdmin })
        ]);
        
        return res.json({
          today: todayResult.data?.[0]?.total || 0,
          overdue: overdueResult.data?.[0]?.total || 0,
          ongoing: ongoingResult.data?.[0]?.total || 0,
          completed: completedResult.data?.[0]?.total || 0
        });
      }
      
      // Lista completa de chamados
      const queryDef = MkAuthAgentService.queries.listarChamados({ date, tecnico, isAdmin });
      
      // Executa diretamente via agente
      const chamados = await MkAuthAgentService.sendToAgent(
        tenant,
        queryDef.sql,
        queryDef.params
      );
      
      const chamadosList = chamados.data || [];
      
      // ===== NOVO: Buscar clientes online para validar status =====
      let clientesOnline = new Set();
      try {
        const clientesOnlineQuery = MkAuthAgentService.queries.listaClientesOnline();
        const clientesOnlineResult = await MkAuthAgentService.sendToAgent(
          tenant,
          clientesOnlineQuery.sql,
          clientesOnlineQuery.params
        );
        
        // Monta set com logins dos clientes conectados
        if (clientesOnlineResult.data && Array.isArray(clientesOnlineResult.data)) {
          clientesOnline = new Set(
            clientesOnlineResult.data
              .filter(c => c.login && typeof c.login === 'string')
              .map(c => c.login)
          );
        }
        logger.info('[RequestController] Clientes online carregados', {
          total: clientesOnline.size
        });
      } catch (error) {
        logger.warn('[RequestController] Erro ao buscar clientes online', {
          error: error.message
        });
      }
      
      // Formata resposta para compatibilidade com app mobile (backend-antigo)
      const response = chamadosList.map(chamado => {
        // Formata hora de visita se existir
        let visitaTime = null;
        if (chamado.visita) {
          const visitaDate = new Date(chamado.visita);
          visitaTime = visitaDate.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
          });
        }
        
        return {
          id: chamado.id,
          visita: visitaTime,
          nome: chamado.nome,
          login: chamado.login,
          senha: chamado.senha,
          plano: chamado.plano,
          tipo: chamado.tipo,
          ip: chamado.ip,
          status: chamado.status,
          prioridade: chamado.prioridade,
          assunto: chamado.assunto,
          endereco: chamado.endereco_res,
          numero: chamado.numero_res,
          bairro: chamado.bairro_res,
          mensagem: chamado.ultima_mensagem || null,
          employee_name: chamado.employee_name || null,
          cliente_status_online: clientesOnline.has(chamado.login) ? 'Online' : 'Offline',
          aberto_por: chamado.atendente || null,
          fechado_por: chamado.login_atend || null
        };
      });
      
      logger.info(`[RequestController] ${response.length} chamados listados`, {
        provedor_id: tenant._id,
        filtros: { date, tecnico, isAdmin }
      });
      
      return res.json(response);
      
    } catch (error) {
      logger.error('[RequestController] Erro ao listar chamados', {
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar chamados',
        message: error.message
      });
    }
  }
  
  /**
   * Busca chamado específico
   * GET /requests/:id
   */
  async show(req, res) {
    try {
      const { tenant } = req;
      const { id } = req.params;
      const { tipo } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca chamado via agente
      const chamados = await MkAuthAgentService.execute(
        tenant,
        'chamadoPorId',
        id,
        tipo
      );
      
      if (!chamados || chamados.length === 0) {
        return res.status(404).json({
          error: 'Chamado não encontrado'
        });
      }
      
      logger.info('[RequestController] Chamado encontrado', {
        provedor_id: tenant._id,
        chamado_id: id
      });
      
      return res.json(chamados[0]);
      
    } catch (error) {
      logger.error('[RequestController] Erro ao buscar chamado', {
        error: error.message,
        chamado_id: req.params.id
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar chamado',
        message: error.message
      });
    }
  }
  
  /**
   * Busca chamado com mensagens (formato legado do backend-antigo)
   * GET /request/:id/:request_type
   * 
   * Suporta dois formatos:
   * 1. /request/:chamado_id/Suporte - request_type é o tipo de chamado
   * 2. /request/form/:login - request_type é o login (CPF/CNPJ) do cliente
   */
  async showLegacy(req, res) {
    try {
      const { tenant } = req;
      let { id: request_id, request_type } = req.params;
      
      logger.info('[RequestController.showLegacy] Iniciando busca', {
        provedor_id: tenant._id,
        request_id,
        request_type
      });
      
      if (!tenant.usaAgente()) {
        logger.warn('[RequestController.showLegacy] Tenant sem agente configurado');
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Detecta se é formato alternativo onde request_type é um login (CPF/CNPJ)
      // Formato: GET /request/form/:login
      const isAlternativeFormat = request_id === 'form' && /^\d{11,14}$/.test(request_type);
      
      if (!isAlternativeFormat && request_type !== 'Suporte') {
        logger.warn('[RequestController.showLegacy] Tipo de chamado não suportado', { request_type });
        return res.status(501).json({
          error: 'Tipo de chamado não suportado',
          message: 'Apenas chamados de Suporte são suportados'
        });
      }
      
      logger.debug('[RequestController.showLegacy] Executando query chamadoCompletoComMensagens');
      
      let resultado;
      
      // Se formato alternativo (GET /request/form/:login), busca últimos chamados do cliente
      if (isAlternativeFormat) {
        const login = request_type;
        logger.info('[RequestController.showLegacy] Formato alternativo detectado', { login });
        
        // Busca ID do cliente usando o login
        const clientQuery = MkAuthAgentService.queries.buscarClientePorLogin(login);
        const clientResult = await MkAuthAgentService.sendToAgent(
          tenant,
          clientQuery.sql,
          clientQuery.params
        );
        
        if (!clientResult.data || clientResult.data.length === 0) {
          logger.warn('[RequestController.showLegacy] Cliente não encontrado', { login });
          return res.status(404).json({
            message: 'Cliente não encontrado'
          });
        }
        
        const client_id = clientResult.data[0].id;
        
        // Busca últimos chamados do cliente (limit 1 para compatibilidade)
        const chamadosQuery = MkAuthAgentService.queries.listarChamadosPorClienteId(client_id);
        const chamadosResult = await MkAuthAgentService.sendToAgent(
          tenant,
          chamadosQuery.sql,
          chamadosQuery.params
        );
        
        resultado = chamadosResult.data || [];
        
        // Se há chamados, busca o completo (com mensagens) do primeiro
        if (resultado.length > 0) {
          const primeiroChamado = resultado[0];
          const chamadoCompletoQuery = MkAuthAgentService.queries.chamadoCompletoComMensagens(primeiroChamado.id);
          const chamadoCompletoResult = await MkAuthAgentService.execute(
            tenant,
            'chamadoCompletoComMensagens',
            primeiroChamado.id
          );
          resultado = chamadoCompletoResult || [];
        }
      } else {
        // Formato padrão: busca por ID do chamado
        // Busca chamado com dados completos (cliente + mensagens)
        resultado = await MkAuthAgentService.execute(
          tenant,
          'chamadoCompletoComMensagens',
          request_id
        );
      }
      
      logger.debug('[RequestController.showLegacy] Query executada', {
        resultado_type: typeof resultado,
        resultado_length: Array.isArray(resultado) ? resultado.length : 'não é array',
        primeiro_item: resultado?.[0] ? Object.keys(resultado[0]) : 'nenhum'
      });
      
      if (!resultado || resultado.length === 0) {
        logger.warn('[RequestController.showLegacy] Nenhum chamado encontrado', { request_id });
        return res.status(404).json({
          message: 'Request ticket does not exist'
        });
      }
      
      const chamado = resultado[0];
      
      logger.info('[RequestController.showLegacy] Chamado completo encontrado', {
        provedor_id: tenant._id,
        chamado_id: request_id,
        client_id: chamado.client_id,
        tem_mensagens: !!chamado.mensagens,
        qtd_mensagens: chamado.mensagens?.length || 0
      });
      
      return res.json(chamado);
      
    } catch (error) {
      logger.error('[RequestController.showLegacy] Erro ao buscar chamado completo', {
        error: error.message,
        stack: error.stack,
        chamado_id: req.params.id
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar chamado',
        message: error.message
      });
    }
  }
  
  /**
   * Cria novo chamado
   * POST /requests
   * 
   * Nota: Criação de chamados requer INSERT, não suportado pelo agente.
   * Este método deve usar a conexão direta ou API específica.
   */
  async store(req, res) {
    try {
      const { tenant } = req;
      
      return res.status(501).json({
        error: 'Criação de chamados não implementada via agente',
        message: 'Use a API de criação de chamados do provedor ou conexão direta'
      });
      
    } catch (error) {
      logger.error('[RequestController] Erro ao criar chamado', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao criar chamado',
        message: error.message
      });
    }
  }
  
  /**
   * Atualiza status de chamado
   * PUT /requests/:id
   * 
   * Nota: Atualização requer UPDATE, não suportado pelo agente.
   * Este método deve usar a conexão direta ou API específica.
   */
  async update(req, res) {
    try {
      const { tenant } = req;
      
      return res.status(501).json({
        error: 'Atualização de chamados não implementada via agente',
        message: 'Use a API de atualização de chamados do provedor ou conexão direta'
      });
      
    } catch (error) {
      logger.error('[RequestController] Erro ao atualizar chamado', {
        error: error.message,
        chamado_id: req.params.id
      });
      
      return res.status(500).json({
        error: 'Erro ao atualizar chamado',
        message: error.message
      });
    }
  }
  
  /**
   * Busca dados para formulário de novo chamado
   * GET /requests/form-data
   */
  async getFormData(req, res) {
    try {
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca técnicos disponíveis
      const tecnicos = await MkAuthAgentService.execute(
        tenant,
        'listarTecnicos'
      );
      
      // Busca planos ativos
      const planos = await MkAuthAgentService.execute(
        tenant,
        'planosAtivos'
      );
      
      logger.info('[RequestController] Dados do formulário carregados', {
        provedor_id: tenant._id,
        tecnicos: tecnicos.length,
        planos: planos.length
      });
      
      return res.json({
        tecnicos,
        planos,
        tipos: ['instalacao', 'suporte', 'mudanca_endereco', 'mudanca_plano', 'cancelamento'],
        prioridades: ['baixa', 'normal', 'alta', 'urgente'],
        status: ['aberto', 'em_andamento', 'aguardando_cliente', 'concluido', 'cancelado']
      });
      
    } catch (error) {
      logger.error('[RequestController] Erro ao carregar dados do formulário', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao carregar dados do formulário',
        message: error.message
      });
    }
  }
  
  /**
   * Estatísticas de chamados
   * GET /requests/stats
   */
  async stats(req, res) {
    try {
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca estatísticas via agente
      const stats = await MkAuthAgentService.execute(
        tenant,
        'estatisticasChamados'
      );
      
      // Busca chamados em atraso
      const atrasados = await MkAuthAgentService.execute(
        tenant,
        'chamadosAtrasados'
      );
      
      logger.info('[RequestController] Estatísticas carregadas', {
        provedor_id: tenant._id,
        total_chamados: stats[0]?.total || 0
      });
      
      return res.json({
        ...stats[0],
        atrasados: atrasados.length
      });
      
    } catch (error) {
      logger.error('[RequestController] Erro ao carregar estatísticas', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao carregar estatísticas',
        message: error.message
      });
    }
  }
  
  /**
   * Lista chamados em atraso
   * GET /requests/overdue
   */
  async overdue(req, res) {
    try {
      const { tenant } = req;
      const { sortMode } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca chamados em atraso com sortMode
      const queryDef = MkAuthAgentService.queries.chamadosAtrasados({ sortMode });
      const result = await MkAuthAgentService.sendToAgent(
        tenant,
        queryDef.sql,
        queryDef.params
      );
      
      const atrasados = result.data || [];
      
      // ===== Buscar clientes online para validar status =====
      let clientesOnline = new Set();
      try {
        const clientesOnlineQuery = MkAuthAgentService.queries.listaClientesOnline();
        const clientesOnlineResult = await MkAuthAgentService.sendToAgent(
          tenant,
          clientesOnlineQuery.sql,
          clientesOnlineQuery.params
        );
        
        if (clientesOnlineResult.data && Array.isArray(clientesOnlineResult.data)) {
          clientesOnline = new Set(
            clientesOnlineResult.data
              .filter(c => c.login && typeof c.login === 'string')
              .map(c => c.login)
          );
        }
        logger.info('[RequestController.overdue] Clientes online carregados', {
          total: clientesOnline.size
        });
      } catch (error) {
        logger.warn('[RequestController.overdue] Erro ao buscar clientes online', {
          error: error.message
        });
      }
      
      // Agrupar por data como no backend-antigo
      const groups = {};
      
      atrasados.forEach(chamado => {
        if (!chamado.visita) return;
        
        // Formata a data de visita
        const visitaDate = new Date(chamado.visita);
        const dateKey = visitaDate.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }).replace('.', '');
        
        // Formata hora de visita
        const visitaTime = visitaDate.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        // Prepara objeto do chamado
        const card = {
          id: chamado.id,
          visita: visitaTime,
          data_visita: visitaDate.toLocaleDateString('pt-BR'),
          nome: chamado.nome,
          login: chamado.login,
          senha: chamado.senha,
          plano: chamado.plano,
          tipo: chamado.tipo,
          ip: chamado.ip,
          status: chamado.status,
          prioridade: chamado.prioridade,
          assunto: chamado.assunto,
          endereco: chamado.endereco_res,
          numero: chamado.numero_res,
          bairro: chamado.bairro_res,
          celular: chamado.celular,
          mensagem: chamado.ultima_mensagem || null,
          employee_name: chamado.employee_name || null,
          cliente_status_online: clientesOnline.has(chamado.login) ? 'Online' : 'Offline',
          aberto_por: chamado.atendente || null,
          fechado_por: chamado.login_atend || null
        };
        
        if (!groups[dateKey]) {
          groups[dateKey] = [];
        }
        groups[dateKey].push(card);
      });
      
      // Formata resposta final
      const response = Object.keys(groups).map(dateKey => ({
        date_group: dateKey,
        cards: groups[dateKey]
      }));
      
      logger.info('[RequestController] Chamados em atraso listados', {
        provedor_id: tenant._id,
        total: atrasados.length,
        grupos: response.length
      });
      
      return res.json(response);
      
    } catch (error) {
      logger.error('[RequestController] Erro ao listar chamados em atraso', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao listar chamados em atraso',
        message: error.message
      });
    }
  }
}

// Cria instância e vincula todos os métodos para preservar `this`
const instance = new RequestController();

// Vincula explicitamente os métodos públicos
instance.index = instance.index.bind(instance);
instance.show = instance.show.bind(instance);
instance.showLegacy = instance.showLegacy.bind(instance);
instance.store = instance.store.bind(instance);
instance.update = instance.update.bind(instance);
instance.getFormData = instance.getFormData.bind(instance);
instance.stats = instance.stats.bind(instance);
instance.overdue = instance.overdue.bind(instance);

module.exports = instance;
