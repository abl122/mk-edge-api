const MkAuthAgentService = require('../services/MkAuthAgentService');
const MkAuthResponseAdapter = require('../helpers/MkAuthResponseAdapter');
const logger = require('../../logger');

/**
 * InvoiceController - Gerenciamento de Faturas/Títulos
 * 
 * Usa MkAuthAgentService + MkAuthResponseAdapter
 * Mantém compatibilidade com frontend existente
 */
class InvoiceController {
  /**
   * Lista faturas de um cliente
   * GET /invoices?login=cliente123
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      const { login, status, page = 1, limit = 50 } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!login) {
        return res.status(400).json({
          error: 'Login do cliente é obrigatório'
        });
      }
      
      // Monta query baseada no status
      let query;
      
      if (status === 'aberto' || status === 'vencido') {
        query = MkAuthAgentService.queries.titulosAbertos(login);
      } else if (status === 'vencidos') {
        query = MkAuthAgentService.queries.titulosVencidos(login);
      } else {
        // Todas as faturas
        query = {
          sql: `SELECT * FROM sis_lanc 
                WHERE login = :login
                  AND datadel IS NULL
                ORDER BY datavenc DESC
                LIMIT :limit OFFSET :offset`,
          params: { 
            login,
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
          }
        };
      }
      
      const result = await MkAuthAgentService.executeQuery(tenant, query);
      
      // Adapta para formato de lista
      const response = MkAuthResponseAdapter.adaptInvoiceList(result, page, limit);
      
      logger.info('Faturas consultadas', {
        tenant: tenant.nome,
        login,
        count: response.total
      });
      
      return res.json(response);
      
    } catch (error) {
      logger.error({
        error: error.message,
        login: req.query.login
      }, 'Erro ao buscar faturas');
      
      return res.status(500).json({
        error: 'Erro ao buscar faturas',
        message: error.message
      });
    }
  }
  
  /**
   * Busca fatura específica por ID
   * GET /invoices/:id
   */
  async show(req, res) {
    try {
      const { tenant } = req;
      const { id } = req.params;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca fatura por ID
      const query = {
        sql: 'SELECT * FROM sis_lanc WHERE id = :id LIMIT 1',
        params: { id: parseInt(id) }
      };
      
      const result = await MkAuthAgentService.executeQuery(tenant, query);
      
      // Adapta resposta (primeiro item)
      const invoice = MkAuthResponseAdapter.adaptSelect(result, true);
      
      if (!invoice) {
        return res.status(404).json({
          error: 'Fatura não encontrada'
        });
      }
      
      logger.info({
        tenant: tenant.nome,
        id
      }, 'Fatura consultada');
      
      return res.json(invoice);
      
    } catch (error) {
      logger.error({
        error: error.message,
        id: req.params.id
      }, 'Erro ao buscar fatura');
      
      return res.status(500).json({
        error: 'Erro ao buscar fatura',
        message: error.message
      });
    }
  }
  
  /**
   * Lista faturas em aberto de um cliente
   * GET /invoices/open?login=cliente123
   */
  async open(req, res) {
    try {
      const { tenant } = req;
      const { login } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!login) {
        return res.status(400).json({
          error: 'Login do cliente é obrigatório'
        });
      }
      
      // Busca faturas em aberto via agente
      const query = MkAuthAgentService.queries.titulosAbertos(login);
      const result = await MkAuthAgentService.executeQuery(tenant, query);
      
      // Adapta resposta
      const invoices = MkAuthResponseAdapter.adaptSelect(result, false);
      
      logger.info({
        tenant: tenant.nome,
        login,
        count: invoices.length
      }, 'Faturas em aberto consultadas');
      
      return res.json({
        invoices,
        total: invoices.length
      });
      
    } catch (error) {
      logger.error({
        error: error.message,
        login: req.query.login
      }, 'Erro ao buscar faturas em aberto');
      
      return res.status(500).json({
        error: 'Erro ao buscar faturas em aberto',
        message: error.message
      });
    }
  }
  
  /**
   * Baixa de fatura (marcar como paga)
   * POST /invoices/:id/pay
   */
  async payInvoice(req, res) {
    try {
      const { tenant } = req;
      const { id } = req.params;
      const { valor_pago, data_pagamento } = req.body;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Verifica se fatura existe
      const checkQuery = {
        sql: 'SELECT * FROM sis_lanc WHERE id = :id LIMIT 1',
        params: { id: parseInt(id) }
      };
      
      const checkResult = await MkAuthAgentService.executeQuery(tenant, checkQuery);
      const invoice = MkAuthResponseAdapter.adaptSelect(checkResult, true);
      
      if (!invoice) {
        return res.status(404).json({
          error: 'Fatura não encontrada'
        });
      }
      
      // Atualiza fatura para pago
      const updateQuery = {
        sql: `UPDATE sis_lanc 
              SET status = 'pago',
                  valorpag = :valor_pago,
                  datapag = :data_pagamento
              WHERE id = :id`,
        params: {
          id: parseInt(id),
          valor_pago: valor_pago || invoice.valor,
          data_pagamento: data_pagamento || new Date().toISOString().split('T')[0]
        }
      };
      
      const result = await MkAuthAgentService.executeQuery(tenant, updateQuery);
      
      // Busca fatura atualizada
      const updatedInvoice = await MkAuthResponseAdapter.adaptUpdate(
        result,
        tenant,
        'sis_lanc',
        'id',
        parseInt(id)
      );
      
      logger.info({
        tenant: tenant.nome,
        id,
        valor: valor_pago
      }, 'Fatura marcada como paga');
      
      return res.json(updatedInvoice);
      
    } catch (error) {
      logger.error({
        error: error.message,
        id: req.params.id
      }, 'Erro ao dar baixa em fatura');
      
      return res.status(500).json({
        error: 'Erro ao dar baixa em fatura',
        message: error.message
      });
    }
  }

  /**
   * Gera QR Code PIX com EFI
   * POST /invoices/pix/generate/:invoiceId
   */
  async generatePix(req, res) {
    try {
      const { tenant } = req;
      const { invoiceId } = req.params;
      const { value, due_date } = req.body;

      const efiConfig = tenant.integrations?.efi;
      if (!efiConfig?.client_id) {
        return res.status(400).json({
          error: 'EFI não configurado para este tenant'
        });
      }

      // Simular QR Code PIX (em produção, usar EFI SDK)
      const pixData = {
        qr_code: `pix_${invoiceId}_${Date.now()}`,
        qr_code_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        copy_paste: `00020126580014br.gov.bcb.pix0136${invoiceId}5204000053039865406${parseFloat(value).toFixed(2)}5802BR5913EMPRESA6009SAO%20PAULO62410503***63047AED`
      };

      res.json({
        success: true,
        message: 'QR Code PIX gerado com sucesso',
        pix: pixData,
        invoice_id: invoiceId
      });
    } catch (error) {
      logger.error('Erro ao gerar PIX:', error);
      res.status(500).json({
        error: 'Erro ao gerar QR Code PIX'
      });
    }
  }

  /**
   * Webhook EFI - Confirma pagamento de fatura
   * POST /webhooks/efi
   */
  async webhookEfi(req, res) {
    try {
      const { event, data } = req.body;

      logger.info(`Webhook EFI recebido: ${event}`, {
        event,
        invoice_id: data?.charge_id
      });

      // Processar eventos de pagamento
      switch (event) {
        case 'charge.confirmed':
          // Pagamento confirmado
          logger.info('Pagamento confirmado via PIX', { invoice_id: data?.charge_id });
          // Enviar notificação ao cliente
          break;
        case 'charge.expired':
          // Fatura expirada
          logger.warn('Fatura expirada', { invoice_id: data?.charge_id });
          break;
      }

      res.json({
        success: true,
        message: 'Webhook processado com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao processar webhook EFI:', error);
      res.status(500).json({
        error: 'Erro ao processar webhook'
      });
    }
  }
}

// Cria instância e vincula todos os métodos para preservar `this`
const instance = new InvoiceController();

// Vincula explicitamente os métodos públicos
instance.index = instance.index.bind(instance);
instance.show = instance.show.bind(instance);
instance.open = instance.open.bind(instance);
instance.payInvoice = instance.payInvoice.bind(instance);
instance.generatePix = instance.generatePix.bind(instance);
instance.webhookEfi = instance.webhookEfi.bind(instance);

module.exports = instance;
