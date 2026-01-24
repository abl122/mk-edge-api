const mongoose = require('mongoose')

const SubscriptionSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    plan_slug: {
      type: String,
      required: true,
      index: true
    },
    plan_name: {
      type: String,
      required: true
    },
    valor_mensal: {
      type: Number,
      required: true,
      default: 0
    },
    data_inicio: {
      type: Date,
      required: true,
      default: Date.now
    },
    data_vencimento: {
      type: Date,
      required: true
    },
    // Status: ativa, suspensa, cancelada, inadimplente, trial
    status: {
      type: String,
      required: true,
      enum: ['ativa', 'suspensa', 'cancelada', 'inadimplente', 'trial'],
      default: 'ativa',
      index: true
    },
    // Mensal, trimestral, semestral, anual, vitalicio
    ciclo_cobranca: {
      type: String,
      required: true,
      enum: ['mensal', 'trimestral', 'semestral', 'anual', 'vitalicio'],
      default: 'mensal'
    },
    // Para upgrades/downgrades
    subscription_anterior_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null
    },
    // Data de cancelamento (se aplicável)
    data_cancelamento: {
      type: Date,
      default: null
    },
    // Motivo do cancelamento
    motivo_cancelamento: {
      type: String,
      default: null
    },
    // Observações gerais
    observacoes: {
      type: String,
      default: ''
    },
    // Pagamentos relacionados (referência simples por enquanto)
    pagamentos: [
      {
        data_pagamento: Date,
        valor: Number,
        metodo: String, // pix, boleto, cartao, etc
        status: {
          type: String,
          enum: ['pendente', 'confirmado', 'cancelado', 'estornado'],
          default: 'pendente'
        },
        referencia: String, // ID externo (gateway de pagamento)
        observacoes: String
      }
    ],
    // Controle de renovação automática
    renovacao_automatica: {
      type: Boolean,
      default: true
    },
    // Trial
    is_trial: {
      type: Boolean,
      default: false
    },
    dias_trial_restantes: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: {
      createdAt: 'criado_em',
      updatedAt: 'atualizado_em'
    }
  }
)

// Índices compostos para queries otimizadas
SubscriptionSchema.index({ tenant_id: 1, status: 1 })
SubscriptionSchema.index({ tenant_id: 1, data_vencimento: 1 })
SubscriptionSchema.index({ status: 1, data_vencimento: 1 })

// Virtual para verificar se está vencida
SubscriptionSchema.virtual('vencida').get(function () {
  if (this.ciclo_cobranca === 'vitalicio') return false
  return this.data_vencimento < new Date()
})

// Virtual para dias até vencimento
SubscriptionSchema.virtual('dias_ate_vencimento').get(function () {
  if (this.ciclo_cobranca === 'vitalicio') return Infinity
  const diff = this.data_vencimento - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
})

// Método para renovar assinatura
SubscriptionSchema.methods.renovar = function (meses = 1) {
  if (this.ciclo_cobranca === 'vitalicio') {
    return this
  }

  const novaData = new Date(this.data_vencimento)
  novaData.setMonth(novaData.getMonth() + meses)
  this.data_vencimento = novaData

  if (this.status === 'inadimplente' || this.status === 'suspensa') {
    this.status = 'ativa'
  }

  return this
}

// Método para cancelar assinatura
SubscriptionSchema.methods.cancelar = function (motivo = '') {
  this.status = 'cancelada'
  this.data_cancelamento = new Date()
  this.motivo_cancelamento = motivo
  this.renovacao_automatica = false
  return this
}

// Método para suspender assinatura
SubscriptionSchema.methods.suspender = function () {
  this.status = 'suspensa'
  return this
}

// Método para marcar como inadimplente
SubscriptionSchema.methods.marcarInadimplente = function () {
  this.status = 'inadimplente'
  return this
}

// Método para reativar assinatura
SubscriptionSchema.methods.reativar = function () {
  if (this.status === 'cancelada') {
    throw new Error('Assinatura cancelada não pode ser reativada')
  }
  this.status = 'ativa'
  return this
}

// Método para registrar pagamento
SubscriptionSchema.methods.registrarPagamento = function (pagamento) {
  this.pagamentos.push(pagamento)
  if (pagamento.status === 'confirmado') {
    this.renovar()
  }
  return this
}

// Configurar JSON output
SubscriptionSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.__v
    return ret
  }
})

module.exports = mongoose.model('Subscription', SubscriptionSchema)
