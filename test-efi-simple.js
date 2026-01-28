/**
 * Script para testar integração EFI usando credenciais configuradas no banco
 * 
 * Uso:
 *   node test-efi-simple.js --setup    # Configura credenciais do .env no banco
 *   node test-efi-simple.js            # Executa teste de integração
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('./src/app/schemas/Tenant');
const Integration = require('./src/app/schemas/Integration');
const fs = require('fs');
const path = require('path');

async function setup() {
  console.log('\n🔧 === CONFIGURANDO EFI === \n');

  try {
    await mongoose.connect(process.env.MONGODB_URL);

    // Verificar credenciais no .env
    if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET || !process.env.EFI_PIX_KEY) {
      console.error('❌ Configure no .env:');
      console.log('   EFI_SANDBOX=true');
      console.log('   EFI_CLIENT_ID=seu_client_id');
      console.log('   EFI_CLIENT_SECRET=seu_client_secret');
      console.log('   EFI_PIX_KEY=sua_chave@email.com\n');
      return;
    }

    // Buscar primeiro tenant
    const tenant = await Tenant.findOne();
    if (!tenant) {
      console.error('❌ Nenhum tenant encontrado\n');
      return;
    }

    console.log(`✅ Tenant: ${tenant.nome_fantasia || tenant.razao_social} (${tenant._id})`);

    // Configurar integration
    let integration = await Integration.findOne({ tenant_id: tenant._id, type: 'efi' });
    
    if (integration && integration.efi?.homologacao?.client_id && 
        integration.efi.homologacao.client_id !== 'Client_Id_COLOQUE_AQUI') {
      console.log('⚠️  Integration EFI já existe com credenciais configuradas!');
      console.log('   Use o arquivo atualizar-credenciais-efi.js para alterar\n');
      return;
    }
    
    if (!integration) {
      integration = new Integration({ tenant_id: tenant._id, type: 'efi' });
    }

    const certPath = path.join(__dirname, 'certificates', 'efi-homologacao.p12');
    const certExists = fs.existsSync(certPath);

    integration.efi = {
      sandbox: true,
      enabled: true,
      homologacao: {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        pix_key: process.env.EFI_PIX_KEY,
        certificate_path: certExists ? certPath : null
      },
      producao: { client_id: '', client_secret: '', pix_key: '', certificate_path: null }
    };

    await integration.save();

    console.log('✅ Configuração salva!');
    console.log(`   Certificado: ${certExists ? '✅ Encontrado' : '⚠️  Não encontrado'}`);
    console.log('\n📋 Execute o teste: node test-efi-simple.js\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

async function test() {
  console.log('\n🧪 === TESTE EFI === \n');

  try {
    await mongoose.connect(process.env.MONGODB_URL);

    // Buscar integration
    const integration = await Integration.findOne({ type: 'efi', 'efi.enabled': true });
    if (!integration) {
      console.log('⚠️  Execute primeiro: node test-efi-simple.js --setup\n');
      return;
    }

    const tenant = await Tenant.findById(integration.tenant_id);
    console.log(`✅ Tenant: ${tenant.nome_fantasia}\n`);

    // Importar e testar EFIService
    const EFIService = require('./src/app/services/EFIService');

    console.log('🔐 Teste 1: Token OAuth2...');
    const token = await EFIService.getAccessToken(tenant._id);
    console.log(`✅ Token: ${token.substring(0, 30)}...\n`);

    console.log('💰 Teste 2: Criar cobrança PIX...');
    const cobranca = await EFIService.criarCobrancaPix(tenant._id, {
      cnpj: '11222333000181', // CNPJ válido de teste
      nome: tenant.nome_fantasia || tenant.razao_social || 'Provedor Teste',
      valor: 99.90,
      expiracao: 3600,
      descricao: 'Teste - Assinatura MK-Edge',
      numero_fatura: 'TEST' + Date.now()
    });

    console.log('✅ Cobrança criada:');
    console.log(`   TXID: ${cobranca.txid}`);
    console.log(`   Status: ${cobranca.status}`);
    console.log(`\n📱 PIX Copia e Cola:\n${cobranca.pix_copy_paste}\n`);

    console.log('🔍 Teste 3: Consultar cobrança...');
    const consulta = await EFIService.consultarCobranca(tenant._id, cobranca.txid);
    console.log(`✅ Status: ${consulta.status} | Valor: R$ ${consulta.valor.original}\n`);

    console.log('✅ === SUCESSO === \n');

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await mongoose.connection.close();
  }
}

// Executar
if (process.argv.includes('--setup')) {
  setup();
} else {
  test();
}
