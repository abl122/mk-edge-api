const mongoose = require('mongoose');

/**
 * Schema Tenant/Provedor
 * 
 * Representa um provedor (tenant) com suporte a múltiplos provedores
 * Cada tenant tem sua própria configuração de agente MK-Auth
 */
const TenantSchema = new mongoose.Schema({
  
  // Informações do provedor
  provedor: {
    nome: {
      type: String,
      required: true,
    },
    razao_social: String,
    cnpj: {
      type: String,
      required: true,
      unique: true,
    },
    dominio: String,
    email: String,
    telefone: String,
    admin_name: String, // Nome do responsável pelo provedor
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  
  // Configuração do banco de dados (DEPRECADA - usar agente)
  // Mantida apenas para compatibilidade com sistemas antigos
  database: {
    host: String,
    name: String,
    dialect: String,
    username: String,
    password: String,
  },
  
  // Configuração do Agente MK-Auth
  agente: {
    // URL completa do agente PHP
    // Exemplo: https://provedor.com.br/admin/addons/mk-edge/api.php
    url: {
      type: String,
      required: false,
    },
    
    // Token secreto compartilhado com o agente
    // Deve ter no mínimo 64 caracteres
    token: {
      type: String,
      required: false,
    },
    
    // Status do agente
    ativo: {
      type: Boolean,
      default: false,
    },
    
    // Última vez que o agente respondeu com sucesso
    ultimo_ping: {
      type: Date,
      default: null,
    },
    
    // Versão do agente instalado
    versao: {
      type: String,
      default: null,
    },
    
    // Configurações adicionais
    config: {
      // Timeout customizado para este provedor (ms)
      timeout: {
        type: Number,
        default: 15000,
      },
      
      // Retry automático em caso de falha
      retry: {
        type: Boolean,
        default: true,
      },
      
      // Número máximo de tentativas
      max_retries: {
        type: Number,
        default: 2,
      },
    },
  },
  
  // Plano atual (slug do plano)
  plano_atual: {
    type: String,
    required: false,
  },
  
  // Assinatura/Subscription
  assinatura: {
    ativa: {
      type: Boolean,
      required: true,
      default: false,
    },
    plano: {
      type: String,
      required: false,
    },
    plano_nome: {
      type: String,
      required: false,
    },
    data_inicio: Date,
    data_fim: Date,
    valor_mensal: Number,
    trial_ate: Date,
    cortesia_ate: Date,
  },
  
  // Sistema integrado
  sistema: {
    tipo: {
      type: String,
      enum: ['mk-auth', 'sgp', 'outro'],
      default: 'mk-auth',
    },
    versao: String,
  },
  
  // Integrações (EFI, ZAPI, etc)
  integracoes: {
    efi: {
      ativa: Boolean,
      client_id: String,
      client_secret: String,
      pix_key: String,
      certificado: String,
    },
    zapi: {
      ativa: Boolean,
      instance: String,
      token: String,
      phone: String,
    },
  },
  
  // Google Maps API Key
  google_maps_api_key: String,
  
  // Metadados
  criado_em: {
    type: Date,
    default: Date.now,
  },
  atualizado_em: {
    type: Date,
    default: Date.now,
  },
  criado_por: String,
  
}, {
  timestamps: true,
  collection: 'tenants',
});

// Índices
// provedor.cnpj já tem índice unique no campo
TenantSchema.index({ 'assinatura.ativa': 1 });
TenantSchema.index({ 'agente.ativo': 1 });

// Métodos
TenantSchema.methods.usaAgente = function() {
  return this.agente && 
         this.agente.ativo && 
         this.agente.url && 
         this.agente.token;
};

TenantSchema.methods.usaConexaoDireta = function() {
  return this.database && 
         this.database.host && 
         this.database.username;
};

TenantSchema.methods.assinaturaAtiva = function() {
  if (!this.assinatura?.ativa) {
    return false;
  }
  
  // Verifica data de fim
  if (this.assinatura.data_fim && this.assinatura.data_fim < new Date()) {
    return false;
  }
  
  return true;
};

TenantSchema.methods.atualizarPingAgente = function(versao = null) {
  this.agente.ultimo_ping = new Date();
  if (versao) {
    this.agente.versao = versao;
  }
  return this.save();
};

// Middleware pre-save
TenantSchema.pre('save', function(next) {
  this.atualizado_em = new Date();
  next();
});

module.exports = mongoose.model('Tenant', TenantSchema);
