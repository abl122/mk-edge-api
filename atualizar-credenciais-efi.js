// Script para atualizar credenciais EFI diretamente no banco
require('dotenv').config();
const mongoose = require('mongoose');
const Integration = require('./src/app/schemas/Integration');

async function atualizar() {
  console.log('\n📝 Atualizando credenciais EFI no banco...\n');
  
  // COLOQUE AS CREDENCIAIS REAIS AQUI:
  const CREDENCIAIS = {
    client_id: 'SEU_CLIENT_ID_REAL',  // Substitua aqui
    client_secret: 'SEU_CLIENT_SECRET_REAL',  // Substitua aqui
    pix_key: 'sua_chave_pix_real@email.com'  // Substitua aqui
  };
  
  if (CREDENCIAIS.client_id === 'SEU_CLIENT_ID_REAL') {
    console.log('⚠️  Edite este arquivo e coloque as credenciais reais na variável CREDENCIAIS');
    return;
  }
  
  await mongoose.connect(process.env.MONGODB_URL);
  
  const integration = await Integration.findOne({ type: 'efi' });
  
  if (!integration) {
    console.log('❌ Nenhuma integration EFI encontrada');
    return;
  }
  
  integration.efi.homologacao.client_id = CREDENCIAIS.client_id;
  integration.efi.homologacao.client_secret = CREDENCIAIS.client_secret;
  integration.efi.homologacao.pix_key = CREDENCIAIS.pix_key;
  
  await integration.save();
  
  console.log('✅ Credenciais atualizadas com sucesso!\n');
  console.log('Client ID:', CREDENCIAIS.client_id);
  console.log('PIX Key:', CREDENCIAIS.pix_key);
  console.log('\n📋 Execute o teste: node test-efi-simple.js\n');
  
  await mongoose.connection.close();
}

atualizar().catch(console.error);
