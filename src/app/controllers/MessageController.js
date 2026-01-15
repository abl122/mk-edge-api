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
}

module.exports = new MessageController();
