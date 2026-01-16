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
  /**
   * Dar baixa em fatura (marcar como pago)
   * POST /invoice/pay
   * 
   * Body esperado:
   * {
   *   invoice_id: "134185",
   *   titulo: "134185",
   *   uuid_lanc: "...",
   *   data_pagamento: "YYYY-MM-DD HH:MM",
   *   formapag: "dinheiro",
   *   valor_pago: "0.20",
   *   acrescimo: "0.00",
   *   multa_mora: "0.00",
   *   desconto: "0.00",
   *   observacao: "",
   *   insnext: "nada",
   *   excluir_efipay: "s"
   * }
   */
  async payInvoice(req, res) {
    try {
      const { tenant } = req;
      const {
        invoice_id,
        titulo,
        uuid_lanc,
        data_pagamento,
        data,
        formapag = 'dinheiro',
        acrescimo = 0,
        multa_mora = 0,
        desconto = 0,
        valor_pago,
        valor,
        observacao,
        coletor,
        cartao_bandeira,
        cartao_numero,
        cheque_banco,
        cheque_numero,
        cheque_agcc,
        insnext,
        excluir_efipay
      } = req.body;

      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }

      console.log('💰 [InvoiceController.payInvoice] Dando baixa na fatura');
      console.log('📦 Payload completo:', req.body);

      // Identificar fatura (aceita invoice_id, titulo ou uuid_lanc)
      const invoiceIdentifier = invoice_id || titulo || uuid_lanc;

      if (!invoiceIdentifier) {
        return res.status(400).json({
          error: 'ID da fatura é obrigatório (invoice_id, titulo ou uuid_lanc)'
        });
      }

      // ✅ BUSCAR FATURA via agente
      console.log(`📝 Buscando fatura: ${invoiceIdentifier}`);

      const searchQuery = {
        sql: `SELECT * FROM sis_lanc 
              WHERE id = ? OR uuid_lanc = ?
              LIMIT 1`,
        params: [invoiceIdentifier, invoiceIdentifier]
      };

      let fatura = null;
      try {
        const resultado = await MkAuthAgentService.executeQuery(tenant, searchQuery);
        if (resultado?.data && Array.isArray(resultado.data) && resultado.data.length > 0) {
          fatura = resultado.data[0];
          console.log('✅ Fatura encontrada:', fatura.id);
        } else {
          fatura = MkAuthResponseAdapter.adaptSelect(resultado, true);
        }
      } catch (searchError) {
        console.warn('⚠️ Erro ao buscar fatura:', searchError.message);
      }

      if (!fatura) {
        return res.status(404).json({
          error: 'Fatura não encontrada',
          invoice_id: invoiceIdentifier
        });
      }

      // ✅ VALIDAR se já está paga
      if (fatura.status === 'pago' || fatura.status === 'Pago') {
        return res.status(400).json({
          error: 'Fatura já está paga',
          invoice: {
            id: fatura.id,
            uuid_lanc: fatura.uuid_lanc,
            status: fatura.status,
            datapag: fatura.datapag
          }
        });
      }

      // ✅ CALCULAR valor final
      const valorOriginal = parseFloat(fatura.valor) || 0;
      const valorAcrescimo = parseFloat(acrescimo) || 0;
      const valorMultaMora = parseFloat(multa_mora) || 0;
      const valorDesconto = parseFloat(desconto) || 0;

      const valorPagoRaw = valor_pago || valor;
      const valorFinal = valorPagoRaw
        ? parseFloat(valorPagoRaw)
        : (valorOriginal + valorAcrescimo + valorMultaMora - valorDesconto);

      console.log('💵 Cálculo:', {
        valorOriginal,
        valorAcrescimo,
        valorMultaMora,
        valorDesconto,
        valorPago: valorPagoRaw || 'não informado',
        valorFinal
      });

      // ✅ PREPARAR data de pagamento
      const dataFinal = data_pagamento || data;
      let dataPagamento;
      if (dataFinal) {
        // Tratar formato "2025-12-11 14:30" substituindo espaço por T para ISO
        const dataISO = dataFinal.includes(' ') ? dataFinal.replace(' ', 'T') : dataFinal;
        dataPagamento = new Date(dataISO);
      } else {
        dataPagamento = new Date();
      }

      const dataPagamentoSQL = dataPagamento.toISOString().slice(0, 19).replace('T', ' ');

      console.log('📅 Data de pagamento:', dataPagamentoSQL);

      // ✅ CONSTRUIR UPDATE SQL com suporte a parâmetros posicionais (?)
      let updateSql = `UPDATE sis_lanc
                       SET status = ?,
                           datapag = ?,
                           coletor = ?,
                           formapag = ?,
                           valorpag = ?`;

      const params = [
        'pago',                        // status
        dataPagamentoSQL,             // datapag
        coletor || 'api',             // coletor (usa do payload ou 'api' como fallback)
        formapag || 'dinheiro',       // formapag
        valorFinal.toFixed(2)         // valorpag
      ];

      if (observacao) {
        updateSql += ', obs = ?';
        params.push(observacao);
      }

      updateSql += ' WHERE id = ? OR uuid_lanc = ?';
      params.push(invoiceIdentifier);
      params.push(invoiceIdentifier);

      console.log('📝 SQL UPDATE:', updateSql);
      console.log('📊 Parâmetros:', params);

      // ✅ EXECUTAR UPDATE via agente
      const result = await MkAuthAgentService.sendToAgent(
        tenant,
        updateSql,
        params
      );

      console.log('✅ Fatura atualizada:', result);

      logger.info({
        tenant: tenant.nome,
        id: fatura.id,
        valor: valorFinal
      }, 'Fatura marcada como paga');

      // ✅ VALIDAR insnext e excluir_efipay
      if (insnext === 'sim' && (valorMultaMora > 0 || valorAcrescimo > 0)) {
        logger.warn('TODO: Adicionar juros na próxima mensalidade');
      }

      if (excluir_efipay === 's') {
        logger.warn('TODO: Excluir título na EfiPay');
      }

      return res.json({
        success: true,
        message: 'Fatura paga com sucesso',
        invoice: {
          id: fatura.id,
          uuid_lanc: fatura.uuid_lanc,
          status: 'pago',
          datapag: dataPagamentoSQL,
          valor: fatura.valor,
          valorpag: valorFinal.toFixed(2),
          formapag: formapag || 'dinheiro'
        }
      });

    } catch (error) {
      logger.error({
        error: error.message,
        payload: req.body
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
