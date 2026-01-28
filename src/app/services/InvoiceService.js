const Invoice = require('../schemas/Invoice')
const Subscription = require('../schemas/Subscription')
const mongoose = require('mongoose')
const logger = require('../../logger')

class InvoiceService {
  /**
   * Gera número sequencial de fatura
   */
  static async gerarNumeroFatura(tenantId) {
    const ano = new Date().getFullYear()
    const mes = String(new Date().getMonth() + 1).padStart(2, '0')
    
    // Buscar última fatura do tenant neste mês/ano
    const ultimaFatura = await Invoice.findOne({
      tenant_id: tenantId,
      numero: new RegExp(`^${ano}${mes}`)
    }).sort({ numero: -1 })

    let sequencia = 1
    if (ultimaFatura) {
      const ultNum = parseInt(ultimaFatura.numero.slice(-4))
      sequencia = ultNum + 1
    }

    return `${ano}${mes}${String(sequencia).padStart(4, '0')}`
  }

  /**
   * Gera fatura para uma assinatura
   */
  static async gerarFatura(subscriptionId, dataVencimento) {
    try {
      const subscription = await Subscription.findById(subscriptionId)
      
      if (!subscription) {
        throw new Error('Assinatura não encontrada')
      }

      if (subscription.status !== 'ativa') {
        throw new Error('Assinatura não está ativa')
      }

      const numero = await this.gerarNumeroFatura(subscription.tenant_id)

      const invoice = new Invoice({
        tenant_id: subscription.tenant_id,
        subscription_id: subscription._id,
        numero,
        descricao: `Assinatura ${subscription.plan_name} - ${subscription.ciclo_cobranca}`,
        valor: subscription.valor_mensal,
        data_vencimento: dataVencimento,
        status: 'pendente'
      })

      await invoice.save()

      logger.info('Fatura gerada com sucesso', {
        invoice_id: invoice._id,
        tenant_id: subscription.tenant_id,
        subscription_id: subscription._id,
        numero: invoice.numero,
        valor: invoice.valor
      })

      return invoice
    } catch (error) {
      logger.error('Erro ao gerar fatura', {
        subscription_id: subscriptionId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Registra pagamento manual de fatura
   */
  static async registrarPagamentoManual(invoiceId, dados, userId) {
    try {
      const invoice = await Invoice.findById(invoiceId)

      if (!invoice) {
        throw new Error('Fatura não encontrada')
      }

      if (invoice.status === 'paga') {
        throw new Error('Fatura já está paga')
      }

      if (invoice.status === 'cancelada') {
        throw new Error('Fatura cancelada não pode ser paga')
      }

      invoice.status = 'paga'
      invoice.pagamento = {
        data_pagamento: dados.data_pagamento || new Date(),
        valor_pago: dados.valor_pago || invoice.valor,
        metodo: dados.metodo || 'manual',
        observacoes: dados.observacoes || '',
        baixado_por: userId
      }

      await invoice.save()

      logger.info('Pagamento manual registrado', {
        invoice_id: invoice._id,
        tenant_id: invoice.tenant_id,
        valor_pago: invoice.pagamento.valor_pago,
        metodo: invoice.pagamento.metodo,
        baixado_por: userId
      })

      return invoice
    } catch (error) {
      logger.error('Erro ao registrar pagamento manual', {
        invoice_id: invoiceId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Registra pagamento via EFI (webhook)
   */
  static async registrarPagamentoEFI(txid, dadosPagamento) {
    try {
      const invoice = await Invoice.findOne({ 'pix.txid': txid })

      if (!invoice) {
        throw new Error(`Fatura não encontrada para txid: ${txid}`)
      }

      if (invoice.status === 'paga') {
        logger.warn('Tentativa de pagar fatura já paga', { invoice_id: invoice._id, txid })
        return invoice
      }

      invoice.status = 'paga'
      invoice.pagamento = {
        data_pagamento: new Date(dadosPagamento.horario),
        valor_pago: parseFloat(dadosPagamento.valor),
        metodo: 'pix',
        referencia_efi: dadosPagamento.endToEndId || txid,
        observacoes: 'Pagamento via PIX EFI'
      }

      await invoice.save()

      logger.info('Pagamento EFI registrado', {
        invoice_id: invoice._id,
        tenant_id: invoice.tenant_id,
        txid,
        valor_pago: invoice.pagamento.valor_pago
      })

      return invoice
    } catch (error) {
      logger.error('Erro ao registrar pagamento EFI', {
        txid,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Lista faturas de um tenant
   */
  static async listarFaturas(tenantId, filtros = {}) {
    try {
      const query = { tenant_id: tenantId }

      if (filtros.status) {
        query.status = filtros.status
      }

      if (filtros.data_inicio && filtros.data_fim) {
        query.data_vencimento = {
          $gte: new Date(filtros.data_inicio),
          $lte: new Date(filtros.data_fim)
        }
      }

      const invoices = await Invoice.find(query)
        .populate('subscription_id', 'plan_name plan_slug')
        .sort({ data_vencimento: -1 })

      return invoices
    } catch (error) {
      logger.error('Erro ao listar faturas', {
        tenant_id: tenantId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Marca faturas vencidas
   */
  static async marcarFaturasVencidas() {
    try {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      const result = await Invoice.updateMany(
        {
          status: 'pendente',
          data_vencimento: { $lt: hoje }
        },
        {
          $set: { status: 'vencida' }
        }
      )

      logger.info('Faturas vencidas marcadas', {
        total: result.modifiedCount
      })

      return result.modifiedCount
    } catch (error) {
      logger.error('Erro ao marcar faturas vencidas', { error: error.message })
      throw error
    }
  }
}

module.exports = InvoiceService
