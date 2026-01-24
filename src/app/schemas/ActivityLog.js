const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  tipo: {
    type: String,
    required: true,
    enum: ['registro', 'plano', 'backup', 'sistema', 'pagamento', 'usuario', 'outro']
  },
  titulo: {
    type: String,
    required: true
  },
  descricao: {
    type: String
  },
  tenant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant'
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Índice para buscar atividades recentes rapidamente
activityLogSchema.index({ created_at: -1 });
activityLogSchema.index({ tenant_id: 1, created_at: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;
