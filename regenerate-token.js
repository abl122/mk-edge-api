const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedge';

mongoose.connect(uri).then(async () => {
  const Tenant = mongoose.model('Tenant');
  const newToken = crypto.randomBytes(32).toString('hex');
  
  const result = await Tenant.findByIdAndUpdate(
    '63dd998b885eb427c8c51958',
    { 'agente.token': newToken },
    { new: true }
  );
  
  console.log('✅ Tenant atualizado:');
  console.log('Tenant ID:', result._id);
  console.log('Provedor:', result.provedor?.nome);
  console.log('Novo Token:', newToken);
  console.log('');
  console.log('📋 Configure este token no agente PHP:');
  console.log('Arquivo: Agente/mk-edge/config.php');
  console.log('');
  console.log(`const API_TOKEN_HMAC = "${newToken}";`);
  
  process.exit(0);
}).catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
