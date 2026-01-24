/**
 * PasswordRecoveryToken.js
 * Schema para armazenar tokens de recuperação de senha
 */

const mongoose = require('mongoose')

const PasswordRecoveryTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    code: {
      type: String,
      required: true,
      index: true
    },
    method: {
      type: String,
      enum: ['sms', 'whatsapp', 'email'],
      required: true
    },
    contact: {
      type: String, // telefone ou email que recebeu o código
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
      expires: 0 // MongoDB irá deletar automaticamente após expiração
    },
    attempts: {
      type: Number,
      default: 0
    },
    maxAttempts: {
      type: Number,
      default: 5
    },
    used: {
      type: Boolean,
      default: false
    },
    usedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'password_recovery_tokens'
  }
)

module.exports = mongoose.model('PasswordRecoveryToken', PasswordRecoveryTokenSchema)
