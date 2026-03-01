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

/**
 * Determina qual tabela usar baseado no request_type
 * @param {string} requestType - 'Suporte', 'Ativação', 'Ativacao', etc
 * @returns {string} Nome da tabela (sis_suporte ou sis_solic)
 */
function getTabelaPorTipo(requestType) {
  const tipo = (requestType || '').toLowerCase();
  
  // Ativação/Instalação usa sis_solic
  if (tipo.includes('ativ') || tipo.includes('instal')) {
    return 'sis_solic';
  }
  
  // Suporte usa sis_suporte (padrão)
  return 'sis_suporte';
}

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
      const queryDef = MkAuthAgentService.queries.listarChamados({ date, tecnico, isAdmin, sortMode: 'DESC' });
      
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
        // Formata data e hora de visita se existir
        let visitaTime = null;
        let dataVisita = null;
        
        if (chamado.visita) {
          const visitaDate = new Date(chamado.visita);
          
          // Formata hora: HH:mm
          visitaTime = visitaDate.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
          });
          
          // Formata data: dd/MM/yyyy (compatível com antigo backend)
          dataVisita = visitaDate.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
        }
        
        return {
          id: chamado.id,
          visita: visitaTime,
          data_visita: dataVisita,
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
      }).sort((a, b) => {
        // Ordena DESC por data_visita e ASC por hora_visita
        // Converte dd/MM/yyyy para timestamp para comparação
        const parseData = (dateStr) => {
          if (!dateStr) return 0;
          const [dia, mes, ano] = dateStr.split('/');
          return new Date(ano, mes - 1, dia).getTime();
        };
        
        const parseHora = (horaStr) => {
          if (!horaStr) return 0;
          const [horas, minutos] = horaStr.split(':');
          return parseInt(horas) * 60 + parseInt(minutos);
        };
        
        const dataA = parseData(a.data_visita);
        const dataB = parseData(b.data_visita);
        
        // Se datas diferentes, ordena DESC (maior primeiro)
        if (dataA !== dataB) {
          return dataB - dataA;
        }
        
        // Se datas iguais, ordena ASC por hora (menor primeiro)
        const horaA = parseHora(a.visita);
        const horaB = parseHora(b.visita);
        return horaA - horaB;
      });
      

      logger.info(`[RequestController] ${response.length} chamados listados`, {
        provedor_id: tenant._id,
        filtros: { date, tecnico, isAdmin },
        chamados: response.map(c => ({
          id: c.id,
          chamado: c.chamado,
          cliente: c.nome,
          login: c.login,
          status: c.status,
          assunto: c.assunto,
          abertura: c.abertura
        }))
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
      
      // NOTA: Removida validação de tipo de chamado aqui
      // O tipo correto virá do request_type no body durante o UPDATE
      
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
  /**
   * Atualizar chamado (fechar, mudar status, etc)
   * POST /request/:id
   * 
   * Para Suporte:
   * {
   *   action: "close_request",
   *   request_type: "Suporte",
   *   closingNote: "Problema resolvido com sucesso",
   *   employee_id: "123456",
   *   closingDate: "2026-01-15T18:58:47.759Z"
   * }
   * 
   * Para Instalação/Ativação:
   * {
   *   action: "close_request",
   *   request_type: "Ativação",
   *   isVisited: true,
   *   isInstalled: true,
   *   isAvailable: true
   * }
   */
  async update(req, res) {
    try {
      const { tenant } = req;
      const chamadoId = req.params.id;
      const { action, request_type, closingNote, employee_id, closingDate, isVisited, isInstalled, isAvailable, new_visita_date, new_visita_time, madeBy, login_atendente, nome_atendente, nota_data } = req.body;
      
      console.log('🔄 [RequestController.update] Iniciando atualização');
      console.log('   - Chamado ID:', chamadoId);
      console.log('   - Action:', action);
      console.log('   - Request Type:', request_type);
      console.log('   - Body:', JSON.stringify(req.body, null, 2));
      
      if (!tenant.usaAgente()) {
        console.error('❌ Tenant não usa agente');
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Validação básica
      if (!chamadoId) {
        console.error('❌ ID do chamado não informado');
        return res.status(400).json({
          error: 'ID do chamado não informado'
        });
      }
      
      // ===== ATUALIZAR APENAS DATA DE VISITA =====
      if (action === 'update_visita_date') {
        console.log('📅 Atualizando DATA de visita (mantendo hora)');
        console.log('   - new_visita_date recebido:', new_visita_date);
        
        if (!new_visita_date) {
          return res.status(400).json({
            error: 'new_visita_date é obrigatório'
          });
        }
        
        // Extrai apenas a data do new_visita_date (mesmo que venha com hora)
        let dataFormatada = new_visita_date;
        if (new_visita_date.includes(' ')) {
          // Se vem com hora, extrai apenas a parte da data
          dataFormatada = new_visita_date.split(' ')[0];
        }
        console.log('   - Data extraída:', dataFormatada);
        
        // Busca a visita atual para extrair a hora
        const queryDef = MkAuthAgentService.queries.chamadoPorId(chamadoId);
        const chamadoAtual = await MkAuthAgentService.sendToAgent(
          tenant,
          queryDef.sql,
          queryDef.params
        );
        
        if (!chamadoAtual?.data || chamadoAtual.data.length === 0) {
          return res.status(404).json({
            error: 'Chamado não encontrado'
          });
        }
        
        // Extrai hora do chamado atual (mantém a hora)
        const visitaAtual = chamadoAtual.data[0].visita;
        let horaAtual = '00:00:00';
        
        if (visitaAtual) {
          const visitaDate = new Date(visitaAtual);
          const hh = String(visitaDate.getHours()).padStart(2, '0');
          const mm = String(visitaDate.getMinutes()).padStart(2, '0');
          const ss = String(visitaDate.getSeconds()).padStart(2, '0');
          horaAtual = `${hh}:${mm}:${ss}`;
        }
        console.log('   - Hora mantida:', horaAtual);
        
        // Combina nova data com hora antiga: YYYY-MM-DD HH:mm:ss
        const novaVisita = `${dataFormatada} ${horaAtual}`;
        console.log('   - Nova visita (data + hora):', novaVisita);
        
        const tabela = getTabelaPorTipo(request_type);
        // 🔧 Atualizar AMBAS as colunas: visita (data+hora) E data_visita (apenas data)
        // Isso garante que não seja modificada por triggers/constraints do banco
        const sql = `UPDATE ${tabela} SET visita = ?, data_visita = ? WHERE id = ?`;
        const valores = [novaVisita, dataFormatada, chamadoId];
        
        console.log('📝 SQL Query:', sql);
        console.log('📊 Parâmetros:', valores);
        
        const result = await MkAuthAgentService.sendToAgent(
          tenant,
          sql,
          valores
        );
        
        console.log('✅ Data de visita atualizada (hora mantida, data_visita sincronizado)!');
        
        return res.json({
          success: true,
          message: `Data de visita do chamado ${chamadoId} atualizada para ${dataFormatada} (hora mantida: ${horaAtual})`,
          chamado_id: chamadoId,
          new_visita_date: dataFormatada,
          hora_mantida: horaAtual,
          nova_visita: novaVisita
        });
      }
      
      // ===== ATUALIZAR APENAS HORA DE VISITA =====
      if (action === 'update_visita_time') {
        console.log('⏰ Atualizando HORA de visita');
        
        if (!new_visita_time) {
          return res.status(400).json({
            error: 'new_visita_time é obrigatório'
          });
        }
        
        // 🔧 Extrair apenas a DATA de new_visita_time para manter sincronizado
        // Formato esperado: "YYYY-MM-DD HH:MM:SS"
        let dataVisita = new_visita_time;
        if (new_visita_time.includes(' ')) {
          dataVisita = new_visita_time.split(' ')[0]; // Extrai "YYYY-MM-DD"
        }
        console.log('   - Data extraída para sincronismo:', dataVisita);
        
        const tabela = getTabelaPorTipo(request_type);
        // 🔧 Atualizar AMBAS as colunas: visita (data+hora) E data_visita (apenas data)
        // Isso garante que não seja modificada por triggers/constraints do banco
        const sql = `UPDATE ${tabela} SET visita = ?, data_visita = ? WHERE id = ?`;
        const valores = [new_visita_time, dataVisita, chamadoId];
        
        console.log('📝 SQL Query:', sql);
        console.log('📊 Parâmetros:', valores);
        
        const result = await MkAuthAgentService.sendToAgent(
          tenant,
          sql,
          valores
        );
        
        console.log('✅ Hora de visita atualizada! (data_visita sincronizado)');
        
        return res.json({
          success: true,
          message: `Hora de visita do chamado ${chamadoId} atualizada para ${new_visita_time}`,
          chamado_id: chamadoId,
          new_visita_time,
          data_visita: dataVisita
        });
      }
      
      // ===== ATUALIZAR TÉCNICO RESPONSÁVEL =====
      if (action === 'update_employee') {
        console.log('👨‍💼 Atualizando TÉCNICO responsável');
        
        if (!employee_id) {
          return res.status(400).json({
            error: 'employee_id é obrigatório'
          });
        }
        
        const tecnicoId = parseInt(employee_id) || 0;
        
        if (tecnicoId === 0) {
          return res.status(400).json({
            error: 'employee_id deve ser um número válido'
          });
        }
        
        const tabela = getTabelaPorTipo(request_type);
        const sql = `UPDATE ${tabela} SET tecnico = ? WHERE id = ?`;
        const valores = [tecnicoId, chamadoId];
        
        console.log('📝 SQL Query:', sql);
        console.log('📊 Parâmetros:', valores);
        console.log('   - Novo técnico ID:', tecnicoId);
        console.log('   - Tabela:', tabela);
        
        const result = await MkAuthAgentService.sendToAgent(
          tenant,
          sql,
          valores
        );
        
        console.log('✅ Técnico atualizado!');
        
        return res.json({
          success: true,
          message: `Técnico do chamado ${chamadoId} atualizado para ID ${tecnicoId}`,
          chamado_id: chamadoId,
          employee_id: tecnicoId
        });
      }
      
      // ===== MAPEAR CLOSE_REQUEST DO APP =====
      let campos = [];
      let valores = [];
      
      if (action === 'close_request') {
        
        // ===== SUPORTE =====
        if (request_type === 'Suporte') {
          console.log('📋 Processando SUPORTE');
          
          // Status = 'fechado'
          campos.push('status = ?');
          valores.push('fechado');
          
          // Data de fechamento
          if (closingDate) {
            campos.push('fechamento = ?');
            const dataFormatada = new Date(closingDate).toISOString().slice(0, 19).replace('T', ' ');
            valores.push(dataFormatada);
            console.log('   - Data fechamento:', dataFormatada);
          }
          
          // Motivo = closingNote
          let motivoFechar = closingNote || 'Fechado pelo app';
          console.log('   - Motivo:', motivoFechar);
          
          campos.push('motivo_fechar = ?');
          valores.push(motivoFechar);
        }
        
        // ===== INSTALAÇÃO/ATIVAÇÃO =====
        else {
          console.log('📋 Processando INSTALAÇÃO/ATIVAÇÃO');
          
          // Data formatada como dd-MM-yyyy HH:mm:ss
          const agora = new Date();
          const dia = String(agora.getDate()).padStart(2, '0');
          const mes = String(agora.getMonth() + 1).padStart(2, '0');
          const ano = agora.getFullYear();
          const hora = String(agora.getHours()).padStart(2, '0');
          const minuto = String(agora.getMinutes()).padStart(2, '0');
          const segundo = String(agora.getSeconds()).padStart(2, '0');
          const formattedDate = `${dia}-${mes}-${ano} ${hora}:${minuto}:${segundo}`;
          
          console.log('   - Data formatada:', formattedDate);
          
          // fechamento
          campos.push('fechamento = ?');
          valores.push(formattedDate);
          
          // datainst
          campos.push('datainst = ?');
          valores.push(formattedDate);
          
          // visitado
          campos.push('visitado = ?');
          valores.push(isVisited ? 'sim' : 'nao');
          
          // instalado
          campos.push('instalado = ?');
          valores.push(isInstalled ? 'sim' : 'nao');
          
          // disp (disponível)
          campos.push('disp = ?');
          valores.push(isAvailable ? 'sim' : 'nao');
          
          console.log('   - visitado:', isVisited ? 'sim' : 'nao');
          console.log('   - instalado:', isInstalled ? 'sim' : 'nao');
          console.log('   - disp:', isAvailable ? 'sim' : 'nao');
        }
      }
      
      // Se não tem campos para atualizar
      if (campos.length === 0) {
        console.error('❌ Nenhum campo para atualizar');
        return res.status(400).json({
          error: 'Nenhuma alteração informada'
        });
      }
      
      // Adiciona o ID do chamado como condição WHERE
      valores.push(chamadoId);
      
      const tabela = getTabelaPorTipo(request_type);
      const sql = `UPDATE ${tabela} SET ${campos.join(', ')} WHERE id = ?`;
      
      console.log('📝 SQL Query:', sql);
      console.log('📊 Parâmetros (array):', valores);
      console.log('   - Tabela:', tabela);
      
      logger.info('[RequestController] Atualizando chamado', {
        chamado_id: chamadoId,
        action: action,
        request_type: request_type,
        tabela: tabela
      });
      
      // Executa via agente (passa array simples para placeholders posicionais)
      const result = await MkAuthAgentService.sendToAgent(
        tenant,
        sql,
        valores
      );
      
      console.log('✅ [RequestController.update] Sucesso!');
      console.log('   - Resultado:', JSON.stringify(result, null, 2));
      
      logger.info('[RequestController] Chamado atualizado com sucesso', {
        chamado_id: chamadoId,
        resultado: result
      });
      
      // ===== ADICIONAR NOTA DE FECHAMENTO =====
      if (action === 'close_request' && closingNote) {
        try {
          console.log('📝 Adicionando nota de fechamento...');
          
          // Busca o número do chamado para inserir a nota
          const queryDef = MkAuthAgentService.queries.chamadoPorId(chamadoId);
          const chamadoInfo = await MkAuthAgentService.sendToAgent(
            tenant,
            queryDef.sql,
            queryDef.params
          );
          
          if (chamadoInfo?.data && chamadoInfo.data.length > 0) {
            const numeroChamado = chamadoInfo.data[0].chamado;
            
            // Usa nota_data se fornecido, senão gera agora
            let dataNota = nota_data;
            if (dataNota) {
              // Converte ISO 8601 para MySQL format (YYYY-MM-DD HH:mm:ss)
              dataNota = new Date(dataNota).toISOString().slice(0, 19).replace('T', ' ');
            } else {
              dataNota = new Date().toISOString().slice(0, 19).replace('T', ' ');
            }
            
            // Usa login_atendente e nome_atendente se fornecidos, senão usa fallbacks
            const loginAtendente = login_atendente || 'app';
            const nomeAtendente = nome_atendente || 'App';
            
            // INSERT nota de fechamento
            const sqlNota = `INSERT INTO sis_msg (chamado, msg, tipo, msg_data, login, atendente) VALUES (?, ?, ?, ?, ?, ?)`;
            const valoresNota = [numeroChamado, closingNote, 'mk-edge', dataNota, loginAtendente, nomeAtendente];
            
            console.log('   - SQL:', sqlNota);
            console.log('   - Params:', valoresNota);
            
            await MkAuthAgentService.sendToAgent(
              tenant,
              sqlNota,
              valoresNota
            );
            
            console.log('✅ Nota de fechamento adicionada com sucesso');
            logger.info('[RequestController] Nota de fechamento adicionada', {
              chamado_id: chamadoId,
              numero_chamado: numeroChamado,
              nota: closingNote
            });
          }
        } catch (noteError) {
          console.warn('⚠️ Erro ao adicionar nota de fechamento:', noteError.message);
          logger.warn('[RequestController] Erro ao adicionar nota de fechamento', {
            chamado_id: chamadoId,
            error: noteError.message
          });
          // Continua mesmo se não conseguir adicionar a nota
        }
      }
      
      return res.json({
        success: true,
        message: `Chamado ${chamadoId} fechado com sucesso`,
        chamado_id: chamadoId,
        novo_status: request_type === 'Suporte' ? 'fechado' : 'ativado'
      });
      
    } catch (error) {
      console.error('❌ [RequestController.update] ERRO:', error.message);
      console.error('   Stack:', error.stack);
      
      // Log da resposta do agente se houver
      if (error.response) {
        console.error('   - Status HTTP:', error.response.status);
        console.error('   - Resposta do agente:', JSON.stringify(error.response.data, null, 2));
      }
      
      logger.error('[RequestController] Erro ao atualizar chamado', {
        error: error.message,
        chamado_id: req.params.id,
        statusAgente: error.response?.status,
        respostaAgente: error.response?.data,
        stack: error.stack
      });
      
      return res.status(500).json({
        error: 'Erro ao atualizar chamado',
        message: error.message,
        agentStatus: error.response?.status,
        agentError: error.response?.data
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
      const tecnicos_result = await MkAuthAgentService.execute(
        tenant,
        'listarTecnicos'
      );
      const tecnicos = tecnicos_result?.data || [];
      
      // Busca planos ativos
      const planos_result = await MkAuthAgentService.execute(
        tenant,
        'planosAtivos'
      );
      const planos = planos_result?.data || [];
      
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
      const { sortMode = 'DESC' } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca chamados em atraso com sortMode (padrão DESC - mais recentes primeiro)
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
