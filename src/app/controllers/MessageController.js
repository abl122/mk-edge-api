/**
 * MessageController - Gerenciamento de Mensagens
 * 
 * Implementa consulta de mensagens entre cliente e provedor
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

class MessageController {
  /**
   * Lista mensagens de um cliente
   * GET /messages?cliente_id=123
   */
  async show(req, res) {
    try {
      const { tenant } = req;
      const { cliente_id, limit } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!cliente_id) {
        return res.status(400).json({
          error: 'ID do cliente é obrigatório'
        });
      }
      
      // Busca mensagens via agente
      const mensagens = await MkAuthAgentService.execute(
        tenant,
        'listarMensagens',
        cliente_id,
        limit ? parseInt(limit) : 100
      );
      
      logger.info(`[MessageController] ${mensagens.length} mensagens encontradas`, {
        provedor_id: tenant._id,
        cliente_id
      });
      
      return res.json(mensagens);
      
    } catch (error) {
      logger.error('[MessageController] Erro ao buscar mensagens', {
        error: error.message,
        cliente_id: req.query.cliente_id
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar mensagens',
        message: error.message
      });
    }
  }
  
  /**
   * Conta mensagens não lidas
   * GET /messages/unread?cliente_id=123
   */
  async unread(req, res) {
    try {
      const { tenant } = req;
      const { cliente_id } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!cliente_id) {
        return res.status(400).json({
          error: 'ID do cliente é obrigatório'
        });
      }
      
      // Busca mensagens não lidas via agente
      const resultado = await MkAuthAgentService.execute(
        tenant,
        'mensagensNaoLidas',
        cliente_id
      );
      
      logger.info('[MessageController] Mensagens não lidas consultadas', {
        provedor_id: tenant._id,
        cliente_id,
        total: resultado[0]?.total || 0
      });
      
      return res.json({
        cliente_id,
        nao_lidas: resultado[0]?.total || 0
      });
      
    } catch (error) {
      logger.error('[MessageController] Erro ao contar mensagens não lidas', {
        error: error.message,
        cliente_id: req.query.cliente_id
      });
      
      return res.status(500).json({
        error: 'Erro ao contar mensagens não lidas',
        message: error.message
      });
    }
  }
  
  /**
   * Cria nova mensagem
   * POST /messages
   * 
   * Nota: Criação requer INSERT, não suportado pelo agente.
   */
  async store(req, res) {
    try {
      return res.status(501).json({
        error: 'Criação de mensagens não implementada via agente',
        message: 'Use a API de mensagens do provedor ou conexão direta'
      });
      
    } catch (error) {
      logger.error('[MessageController] Erro ao criar mensagem', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao criar mensagem',
        message: error.message
      });
    }
  }

  /**
   * Lista templates de notificações
   */
  async listTemplates(req, res) {
    try {
      const templates = [
        {
          id: 'welcome',
          name: 'Boas-Vindas',
          trigger: 'new_customer',
          subject: 'Bem-vindo ao {{TENANT_NAME}}',
          whatsapp: 'Olá {{cliente_nome}}, bem-vindo ao {{TENANT_NAME}}!',
          email: '<h2>Bem-vindo!</h2>',
          enabled: true
        },
        {
          id: 'reminder',
          name: 'Lembrete de Vencimento',
          trigger: 'before_due_date',
          subject: 'Lembrete: Fatura vence em {{dias}} dias',
          whatsapp: 'Olá {{cliente_nome}}, sua fatura vence em {{dias}} dias.',
          email: '<p>Sua fatura vence em {{dias}} dias.</p>',
          enabled: true
        },
        {
          id: 'confirmed',
          name: 'Pagamento Confirmado',
          trigger: 'payment_confirmed',
          subject: 'Pagamento Confirmado',
          whatsapp: 'Pagamento de {{valor}} confirmado! Obrigado.',
          email: '<h2>Pagamento Confirmado</h2>',
          enabled: true
        },
        {
          id: 'suspension',
          name: 'Suspensão de Serviço',
          trigger: 'suspension',
          subject: 'Seu serviço foi suspenso',
          whatsapp: 'Sua conta foi suspensa. Favor regularizar.',
          email: '<h2>Atenção</h2><p>Sua conta foi suspensa.</p>',
          enabled: true
        }
      ];

      return res.json({
        success: true,
        templates,
        total: templates.length
      });
    } catch (error) {
      logger.error('Erro ao listar templates:', error);
      return res.status(500).json({
        error: 'Erro ao listar templates'
      });
    }
  }

  /**
   * Envia mensagem via Z-API (WhatsApp)
   */
  async sendWhatsApp(req, res) {
    try {
      const { tenant } = req;
      const { phone, message, template_id } = req.body;

      const zapiConfig = tenant.integrations?.zapi;
      if (!zapiConfig?.instance || !zapiConfig?.token) {
        return res.status(400).json({
          error: 'Z-API não configurada para este tenant'
        });
      }

      logger.info(`Enviando WhatsApp para ${phone}`);

      // Em produção: usar Z-API SDK
      // const response = await axios.post(`https://api.z-api.io/instances/${zapiConfig.instance}/...`);

      return res.json({
        success: true,
        message: 'Mensagem enviada com sucesso via WhatsApp',
        phone
      });
    } catch (error) {
      logger.error('Erro ao enviar WhatsApp:', error);
      return res.status(500).json({
        error: 'Erro ao enviar mensagem'
      });
    }
  }

  /**
   * Webhook Z-API - Processa mensagens recebidas
   */
  async webhookZapi(req, res) {
    try {
      const { event, data } = req.body;

      logger.info(`Webhook Z-API: ${event}`, {
        phone: data?.phone,
        sender: data?.sender
      });

      switch (event) {
        case 'message.received':
          logger.info(`Mensagem recebida de ${data?.phone}`);
          break;
        case 'message.sent':
          logger.info('Mensagem enviada com sucesso');
          break;
      }

      return res.json({
        success: true,
        message: 'Webhook processado'
      });
    } catch (error) {
      logger.error('Erro ao processar webhook Z-API:', error);
      return res.status(500).json({
        error: 'Erro ao processar webhook'
      });
    }
  }

  /**
   * Adicionar nota a um chamado
   * POST /messages
   * Query: chamado=XXX
   * Body: { msg, msg_data } ou { action: "add_note", msg, data, login_atendente, nome_atendente }
   */
  async store(req, res) {
    try {
      const { tenant } = req;
      const { chamado } = req.query;
      const { msg, msg_data, action, data, login, atendente, login_atendente, nome_atendente } = req.body;
      
      // Suporta ambos os formatos (antigo e novo app)
      const nota = msg || req.body.msg;
      const dataFormatada = msg_data || data;
      
      console.log('📝 [MessageController.store] Adicionando nota');
      console.log('   - Chamado:', chamado);
      console.log('   - Ação:', action);
      console.log('   - Nota:', nota?.substring(0, 50));
      console.log('   - Data:', dataFormatada);
      console.log('   - Login (do payload):', login_atendente || login);
      console.log('   - Atendente (do payload):', nome_atendente || atendente);
      
      if (!tenant.usaAgente()) {
        console.error('❌ Tenant não usa agente');
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Validações
      if (!chamado) {
        console.error('❌ ID do chamado não informado');
        return res.status(400).json({
          error: 'ID do chamado não informado'
        });
      }
      
      if (!nota) {
        console.error('❌ Mensagem não informada');
        return res.status(400).json({
          error: 'Mensagem não informada'
        });
      }
      
      // Constrói query INSERT para sis_msg (tabela de mensagens/notas)
      const campos = ['chamado', 'msg', 'tipo'];
      const valores = [chamado, nota, 'mk-edge'];
      
      // Data da mensagem (OBRIGATÓRIA)
      campos.push('msg_data');
      let agora = new Date().toISOString().slice(0, 19).replace('T', ' ');
      let dataSql = agora;
      if (dataFormatada) {
        const dataObj = new Date(dataFormatada);
        dataSql = dataObj.toISOString().slice(0, 19).replace('T', ' ');
      }
      valores.push(dataSql);
      
      // ✅ Login - usar do novo campo (login_atendente), depois do payload antigo (login), depois do req.user, depois padrão
      const loginFinal = login_atendente || login || req.user?.login || 'app';
      campos.push('login');
      valores.push(loginFinal);
      console.log('   - Login final (será inserido):', loginFinal);
      
      // ✅ Atendente - usar do novo campo (nome_atendente), depois do payload antigo (atendente), depois do req.user, depois padrão
      const atendenteFinal = nome_atendente || atendente || req.user?.nome || 'App';
      campos.push('atendente');
      valores.push(atendenteFinal);
      console.log('   - Atendente final (será inserido):', atendenteFinal);
      
      const placeholders = campos.map(() => '?').join(', ');
      const sql = `INSERT INTO sis_msg (${campos.join(', ')}) VALUES (${placeholders})`;
      
      console.log('📝 SQL Query:', sql);
      console.log('📊 Parâmetros:', valores);
      
      logger.info('[MessageController.store] Adicionando nota', {
        chamado_id: chamado,
        nota_length: nota.length
      });
      
      // Executa via agente
      const result = await MkAuthAgentService.sendToAgent(
        tenant,
        sql,
        valores
      );
      
      console.log('✅ [MessageController.store] Sucesso!');
      console.log('   - Resultado:', JSON.stringify(result, null, 2));
      
      logger.info('[MessageController.store] Nota adicionada com sucesso', {
        chamado_id: chamado,
        resultado: result
      });
      
      return res.json({
        success: true,
        message: 'Nota adicionada com sucesso',
        chamado_id: chamado,
        nota: nota
      });
      
    } catch (error) {
      console.error('❌ [MessageController.store] ERRO:', error.message);
      console.error('   Stack:', error.stack);
      
      // Log da resposta do agente se houver
      if (error.response) {
        console.error('   - Status HTTP:', error.response.status);
        console.error('   - Resposta do agente:', JSON.stringify(error.response.data, null, 2));
      }
      
      logger.error('[MessageController.store] Erro ao adicionar nota', {
        error: error.message,
        chamado_id: req.query.chamado,
        statusAgente: error.response?.status,
        respostaAgente: error.response?.data,
        stack: error.stack
      });
      
      return res.status(500).json({
        error: 'Erro ao adicionar nota',
        message: error.message,
        agentStatus: error.response?.status,
        agentError: error.response?.data
      });
    }
  }
}

module.exports = new MessageController();
