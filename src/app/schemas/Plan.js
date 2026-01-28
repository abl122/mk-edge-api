/**
 * Plan.js
 * Schema para planos de assinatura
 */

const mongoose = require('mongoose')

const PlanSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  
  nome: {
    type: String,
    required: true
  },
  
  slug: {
    type: String,
    required: true,
    lowercase: true
  },
  
  descricao: String,
  
  valor_mensal: {
    type: Number,
    required: true,
    default: 0
  },
  
  periodo: {
    type: String,
    enum: ['mensal', 'semestral', 'anual', 'vitalicio'],
    default: 'mensal'
  },
  
  cor: {
    type: String,
    default: '#4F46E5'
  },
  
  recursos: [String],
  
  limite_clientes: {
    type: Number,
    default: 0 // 0 = ilimitado
  },
  
  dias_trial: {
    type: Number,
    default: 0
  },
  
  recorrente: {
    type: Boolean,
    default: false
  },
  
  destaque: {
    type: Boolean,
    default: false
  },
  
  ativo: {
    type: Boolean,
    default: true
  },
  
  ordem: {
    type: Number,
    default: 0
  },
  
  updated_at: {
    type: Date,
    default: Date.now
  },
  
  created_at: {
    type: Date,
    default: Date.now
  }
}, { 
  collection: 'plans',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
})

// Índices
PlanSchema.index({ tenant_id: 1, slug: 1 }, { unique: true })
PlanSchema.index({ tenant_id: 1, ativo: 1 })

module.exports = mongoose.model('Plan', PlanSchema)
