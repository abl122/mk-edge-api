const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    required: true,
    lowercase: true,
    sparse: true,
  },
  telefone: String,
  celular: String,
  
  // Login e Senha
  login: {
    type: String,
    required: true,
    unique: true,
  },
  senha: {
    type: String,
    required: true,
  },
  
  // Referência ao Tenant (provedor)
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  
  // Papéis (roles) no tenant
  roles: [{
    type: String,
    enum: ['admin', 'gerente', 'tecnico', 'usuario', 'guest'],
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
UserSchema.index({ login: 1, tenant_id: 1 }, { unique: true });
UserSchema.index({ email: 1, tenant_id: 1 }, { unique: true, sparse: true });
UserSchema.index({ tenant_id: 1 });
UserSchema.index({ ativo: 1 });

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

// Método estático para encontrar por login e tenant
UserSchema.statics.findByLoginAndTenant = async function (login, tenantId) {
  return this.findOne({ login, tenant_id: tenantId });
};

module.exports = mongoose.model('User', UserSchema);
