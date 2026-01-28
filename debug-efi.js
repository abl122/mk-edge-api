// Debug: Ver exatamente o que o EFIService está carregando
require('dotenv').config();
const mongoose = require('mongoose');

async function debug() {
  await mongoose.connect(process.env.MONGODB_URL);
  
  const Tenant = require('./src/app/schemas/Tenant');
  const tenant = await Tenant.findOne();
  
  console.log('\n=== DEBUG EFI ===\n');
  console.log('Tenant ID:', tenant._id.toString());
  
  const EFIService = require('./src/app/services/EFIService');
  
  try {
    const config = await EFIService.getConfig(tenant._id);
    console.log('\n✅ Config carregada pelo EFIService:');
    console.log('Base URL:', config.baseURL);
    console.log('Client ID:', config.clientId);
    console.log('Client Secret:', config.clientSecret?.substring(0, 20) + '...');
    console.log('PIX Key:', config.pixKey);
    console.log('Certificate Path:', config.certificatePath);
    console.log('Sandbox:', config.sandbox);
  } catch (error) {
    console.log('\n❌ Erro:', error.message);
  }
  
  await mongoose.connection.close();
}

debug().catch(console.error);
