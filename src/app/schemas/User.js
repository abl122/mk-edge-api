const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../../logger');

/**
 * Schema de Usuário
 * 
 * Representa usuários que podem estar em um ou mais tenants
 * Suporta acesso multi-tenant
 */
const UserSchema = new mongoose.Schema({
  
  // Informações básicas
  nome: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: false, // Não obrigatório para permitir criação, mas recomendado para recuperação de senha
    lowercase: true,
    sparse: true,
    trim: true,
  },
  telefone: {
    type: String,
    trim: true,
  },
  celular: {
    type: String,
    trim: true,
  },
  
  // Login e Senha
  login: {
    type: String,
    required: true,
  },
  senha: {
    type: String,
    required: true,
  },
  
  // Referência ao Tenant (provedor)
  // Obrigatório para usuários 'portal', opcional para 'admin'
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: false,
  },
  
  // Papéis (roles) no tenant
  // admin: acesso global ao painel administrativo (sem tenant)
  // portal: acesso ao portal do provedor (requer tenant)
  // gerente, tecnico, usuario, guest: níveis dentro do portal
  roles: [{
    type: String,
    enum: ['admin', 'portal', 'gerente', 'tecnico', 'usuario', 'guest'],
    default: 'usuario'
  }],
  
  // Permissões customizadas
  permissoes: [{
    type: String,
    // Exemplos: 'client:read', 'client:create', 'invoice:read', etc
  }],
  
  // Status
  ativo: {
    type: Boolean,
    default: true,
  },
  bloqueado: {
    type: Boolean,
    default: false,
  },
  motivo_bloqueio: String,
  
  // Tentativas de login falhadas
  tentativas_login: {
    type: Number,
    default: 0,
  },
  ultima_tentativa: Date,
  
  // Último login
  ultimo_login: Date,
  
  // Recuperação de senha
  recuperacao_senha: {
    codigo: String,
    expira_em: Date,
    metodo: String, // 'sms', 'email', 'whatsapp'
    celular: String,
    email_recovery: String
  },
  
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
  collection: 'users',
});

// Índices
// Login único: por tenant (portal) ou global (admin)
UserSchema.index({ login: 1, tenant_id: 1 }, { unique: true, sparse: true });
UserSchema.index({ login: 1 }, { unique: true, sparse: true, partialFilterExpression: { tenant_id: { $exists: false } } });
UserSchema.index({ email: 1, tenant_id: 1 }, { unique: true, sparse: true });
UserSchema.index({ tenant_id: 1 }, { sparse: true });
UserSchema.index({ ativo: 1 });
UserSchema.index({ roles: 1 });

// Middleware para hash de senha antes de salvar
UserSchema.pre('save', async function (next) {
  // Se a senha não foi modificada, continua
  if (!this.isModified('senha')) {
    return next();
  }

  try {
    // Gera salt e hash
    const salt = await bcrypt.genSalt(10);
    this.senha = await bcrypt.hash(this.senha, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar senhas
UserSchema.methods.compareSenha = async function (senhaPlaintext) {
  return await bcrypt.compare(senhaPlaintext, this.senha);
};

// Método para verificar se usuário tem permissão
UserSchema.methods.temPermissao = function (permissao) {
  // Se é admin, tem todas as permissões
  if (this.roles.includes('admin')) {
    return true;
  }

  // Verifica permissões específicas
  return this.permissoes.includes(permissao);
};

// Método para obter informações públicas do usuário
UserSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.senha; // Remove senha
  delete obj.tentativas_login;
  return obj;
};

// Método estático para criar usuário
UserSchema.statics.criar = async function (data) {
  const usuario = new this(data);
  await usuario.save();
  return usuario;
};

// Método estático para encontrar por login (admin sem tenant ou portal com tenant)
UserSchema.statics.findByLogin = async function (login, tenantId = null) {
  if (tenantId) {
    // Busca usuário portal no tenant específico
    return this.findOne({ login, tenant_id: tenantId });
  } else {
    // Busca usuário admin global (sem tenant)
    return this.findOne({ login, tenant_id: { $exists: false } });
  }
};

// Método estático legado (compatibilidade)
UserSchema.statics.findByLoginAndTenant = async function (login, tenantId) {
  return this.findByLogin(login, tenantId);
};

// Valida consistência de dados antes de salvar
UserSchema.pre('save', async function (next) {
  // Se tem role 'portal' mas não tem tenant_id, erro
  if (this.roles.includes('portal') && !this.tenant_id) {
    return next(new Error('Usuários com role "portal" precisam ter tenant_id'));
  }
  
  // Se é admin, não deve ter tenant_id
  if (this.roles.includes('admin') && this.tenant_id) {
    logger.warn('Admin com tenant_id será convertido para admin global', {
      login: this.login,
      tenant_id: this.tenant_id
    });
    this.tenant_id = undefined;
  }
  
  next();
});

module.exports = mongoose.model('User', UserSchema);
