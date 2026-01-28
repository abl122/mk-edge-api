// Script rápido para ver as credenciais EFI salvas no banco
require('dotenv').config();
const mongoose = require('mongoose');
const Integration = require('./src/app/schemas/Integration');

async function ver() {
  await mongoose.connect(process.env.MONGODB_URL);
  
  const integration = await Integration.findOne({ type: 'efi' });
  
  if (!integration) {
    console.log('❌ Nenhuma integration EFI encontrada');
    return;
  }
  
  console.log('\n✅ Integration EFI encontrada:\n');
  console.log('Tenant ID:', integration.tenant_id);
  console.log('Sandbox:', integration.efi.sandbox);
  console.log('Enabled:', integration.efi.enabled);
  console.log('\n=== Homologação ===');
  console.log('Client ID:', integration.efi.homologacao.client_id);
  console.log('Client Secret:', integration.efi.homologacao.client_secret?.substring(0, 20) + '...');
  console.log('PIX Key:', integration.efi.homologacao.pix_key);
  console.log('Cert Path:', integration.efi.homologacao.certificate_path);
  
  await mongoose.connection.close();
}

ver().catch(console.error);
