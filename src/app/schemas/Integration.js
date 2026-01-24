/**
 * Integration.js
 * Schema para armazenar integrações de tenants
 * 
 * Integra com: Z-API, EFI, SMS, Email, etc
 */

const mongoose = require('mongoose')

const IntegrationSchema = new mongoose.Schema({
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  
  type: {
    type: String,
    enum: ['zapi', 'efi', 'sms', 'email'],
    required: true,
    index: true
  },
  
  // Z-API (WhatsApp)
  zapi: {
    instanceId: String,
    instanceToken: String,
    securityToken: String,
    enabled: { type: Boolean, default: false }
  },
  
  // EFI (Gerencianet/Pix)
  efi: {
    // Configuração geral
    sandbox: { type: Boolean, default: true },
    enabled: { type: Boolean, default: false },
    
    // Ambientes (multi-environment)
    homologacao: {
      client_id: String,
      client_secret: String,
      pix_key: String,
      certificate_path: String
    },
    producao: {
      client_id: String,
      client_secret: String,
      pix_key: String,
      certificate_path: String
    }
  },
  
  // SMS Gateway
  sms: {
    endpoint: String,
    url: String,
    username: String,
    user: String,
    token: String,
    default_sender: { type: String, default: 'MK-Edge' },
    password: String,
    method: { type: String, enum: ['GET', 'POST'], default: 'POST' },
    enabled: { type: Boolean, default: false }
  },
  
  // Email (SMTP)
  email: {
    // nomes compatíveis antigos e novos
    host: String,
    smtp_host: String,
    port: Number,
    smtp_port: Number,
    user: String,
    username: String,
    usuario: String,
    password: String,
    senha: String,
    from: String,
    from_email: String,
    de: String,
    from_name: { type: String, default: 'MK-Edge' },
    usar_tls: { type: Boolean, default: true },
    enabled: { type: Boolean, default: false },
    habilitado: { type: Boolean, default: false }
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
  collection: 'integrations',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
})

// Índices compostos para melhor performance
IntegrationSchema.index({ tenant_id: 1, type: 1 }, { unique: true })

module.exports = mongoose.model('Integration', IntegrationSchema)
