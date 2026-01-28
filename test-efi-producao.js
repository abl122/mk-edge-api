/**
 * Teste REAL em PRODUÇÃO - EFI
 * 
 * Execute: node test-efi-producao.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('./src/app/schemas/Tenant');
const Integration = require('./src/app/schemas/Integration');

async function testeProducao() {
  console.log('\n💰 === TESTE REAL PRODUÇÃO EFI === \n');
  console.log('⚠️  ATENÇÃO: Este é um teste em PRODUÇÃO com cobrança REAL!\n');

  try {
    await mongoose.connect(process.env.MONGODB_URL);

    // Buscar integration
    const integration = await Integration.findOne({ type: 'efi' });
    if (!integration) {
      console.log('❌ Integration EFI não encontrada\n');
      return;
    }

    // Verificar se está em produção
    if (integration.efi.sandbox) {
      console.log('❌ Integration ainda está em modo SANDBOX!');
      console.log('   Altere no painel admin: Integrações → EFI → Ambiente: Produção\n');
      return;
    }

    const tenant = await Tenant.findById(integration.tenant_id);
    console.log(`✅ Tenant: ${tenant.nome_fantasia || tenant.razao_social || 'N/A'}`);
    console.log(`✅ Ambiente: PRODUÇÃO ⚠️\n`);

    // Importar EFIService
    const EFIService = require('./src/app/services/EFIService');

    console.log('🔐 Autenticando...');
    const token = await EFIService.getAccessToken(tenant._id);
    console.log(`✅ Token obtido\n`);

    console.log('💰 Criando cobrança PIX REAL...');
    console.log('   Nome: Antonio Brito Lima');
    console.log('   CPF: 217.981.762-20');
    console.log('   Valor: R$ 2,00\n');

    const cobranca = await EFIService.criarCobrancaPix(tenant._id, {
      cpf: '21798176220',
      nome: 'Antonio Brito Lima',
      valor: 2.00,
      expiracao: 3600,
      descricao: 'Teste Producao - MK-Edge',
      numero_fatura: 'PROD' + Date.now()
    });

    console.log('✅ Cobrança REAL criada com sucesso!\n');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📊 DADOS DA COBRANÇA:\n');
    console.log(`   TXID: ${cobranca.txid}`);
    console.log(`   Status: ${cobranca.status}`);
    console.log(`   Valor: R$ 2,00`);
    console.log(`   Expira em: ${cobranca.expiracao}\n`);
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📱 PIX COPIA E COLA:\n');
    console.log(`${cobranca.pix_copy_paste}\n`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    if (cobranca.qr_code_image) {
      console.log('🖼️  QR Code disponível (base64)\n');
    }

    console.log('📋 Para pagar:');
    console.log('   1. Abra seu app bancário');
    console.log('   2. Vá em PIX → Pagar');
    console.log('   3. Cole o código acima');
    console.log('   4. Confirme o pagamento de R$ 2,00\n');

    console.log('🔔 O webhook EFI notificará automaticamente quando pago!\n');

    // Consultar status
    console.log('🔍 Consultando status atual...');
    const consulta = await EFIService.consultarCobranca(tenant._id, cobranca.txid);
    console.log(`✅ Status: ${consulta.status}\n`);

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    if (error.response?.data) {
      console.error('Detalhes:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await mongoose.connection.close();
  }
}

testeProducao();
