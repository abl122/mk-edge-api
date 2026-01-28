const mongoose = require('mongoose')

const InvoiceSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    subscription_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
      index: true
    },
    numero: {
      type: String,
      required: true,
      unique: true
    },
    descricao: {
      type: String,
      required: true
    },
    valor: {
      type: Number,
      required: true
    },
    data_vencimento: {
      type: Date,
      required: true,
      index: true
    },
    data_emissao: {
      type: Date,
      required: true,
      default: Date.now
    },
    status: {
      type: String,
      required: true,
      enum: ['pendente', 'paga', 'vencida', 'cancelada'],
      default: 'pendente',
      index: true
    },
    // Dados do pagamento (quando pago)
    pagamento: {
      data_pagamento: Date,
      valor_pago: Number,
      metodo: {
        type: String,
        enum: ['pix', 'boleto', 'cartao', 'dinheiro', 'transferencia', 'manual', 'outro']
      },
      referencia_efi: String, // ID da transação na EFI
      observacoes: String,
      baixado_por: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    // Dados da cobrança PIX (se houver)
    pix: {
      txid: String,
      qr_code: String,
      qr_code_image: String,
      pix_copy_paste: String,
      expiracao: Date
    },
    observacoes: String
  },
  {
    timestamps: {
      createdAt: 'criado_em',
      updatedAt: 'atualizado_em'
    }
  }
)

// Índices compostos para melhor performance
InvoiceSchema.index({ tenant_id: 1, status: 1 })
InvoiceSchema.index({ tenant_id: 1, data_vencimento: 1 })
InvoiceSchema.index({ subscription_id: 1, status: 1 })

module.exports = mongoose.model('Invoice', InvoiceSchema)
