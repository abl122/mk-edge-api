/**
 * Teste de Integração com EFI - Ambiente de Homologação
 * 
 * Execute: node test-efi-integration.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const EFIService = require('./src/app/services/EFIService');
const Invoice = require('./src/app/schemas/Invoice');
const Tenant = require('./src/app/schemas/Tenant');
const Subscription = require('./src/app/schemas/Subscription');

async function testarIntegracao() {
  console.log('\n🧪 === TESTE DE INTEGRAÇÃO EFI - HOMOLOGAÇÃO === \n');

  try {
    // Conectar ao MongoDB
    console.log('📦 Conectando ao MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ MongoDB conectado\n');

    // Verificar configurações
    console.log('🔧 Configurações EFI:');
    console.log(`   Ambiente: ${process.env.EFI_SANDBOX === 'true' ? 'HOMOLOGAÇÃO' : 'PRODUÇÃO'}`);
    console.log(`   Client ID: ${process.env.EFI_CLIENT_ID ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`   Client Secret: ${process.env.EFI_CLIENT_SECRET ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`   PIX Key: ${process.env.EFI_PIX_KEY || '❌ Não configurado'}\n`);

    if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET) {
      throw new Error('Credenciais EFI não configuradas no .env');
    }

    // Teste 1: Obter token OAuth2
    console.log('🔐 Teste 1: Autenticação OAuth2...');
    const token = await EFIService.getAccessToken();
    console.log('✅ Token obtido:', token.substring(0, 30) + '...\n');

    // Teste 2: Criar cobrança PIX de teste
    console.log('💰 Teste 2: Criar cobrança PIX...');
    const cobrancaTeste = {
      cnpj: '12345678000199',
      nome: 'Provedor Teste',
      valor: 99.90,
      expiracao: 3600,
      descricao: 'Teste de integração - Assinatura MK-Edge',
      numero_fatura: 'TEST202601001'
    };

    const cobranca = await EFIService.criarCobrancaPix(cobrancaTeste);
    console.log('✅ Cobrança criada:');
    console.log(`   TXID: ${cobranca.txid}`);
    console.log(`   Status: ${cobranca.status}`);
    console.log(`   Expira em: ${cobranca.expiracao}`);
    console.log(`   PIX Copia e Cola: ${cobranca.pix_copy_paste.substring(0, 50)}...`);
    console.log(`   QR Code Image: ${cobranca.qr_code_image ? '✅ Gerado' : '❌ Não gerado'}\n`);

    // Teste 3: Consultar cobrança criada
    console.log('🔍 Teste 3: Consultar cobrança...');
    const cobrancaConsulta = await EFIService.consultarCobranca(cobranca.txid);
    console.log('✅ Cobrança consultada:');
    console.log(`   Status: ${cobrancaConsulta.status}`);
    console.log(`   Valor: R$ ${cobrancaConsulta.valor.original}\n`);

    // Teste 4: Criar fatura de teste com dados PIX
    console.log('📄 Teste 4: Criar fatura com dados PIX...');
    
    // Buscar primeiro tenant para teste
    const tenant = await Tenant.findOne();
    if (!tenant) {
      console.log('⚠️  Nenhum tenant encontrado, pulando criação de fatura\n');
    } else {
      const subscription = await Subscription.findOne({ tenant_id: tenant._id });
      
      if (!subscription) {
        console.log('⚠️  Nenhuma subscription encontrada, pulando criação de fatura\n');
      } else {
        const invoice = new Invoice({
          tenant_id: tenant._id,
          subscription_id: subscription._id,
          numero: 'TEST202601001',
          descricao: 'Fatura de teste - Integração EFI',
          valor: 99.90,
          data_vencimento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: 'pendente',
          pix: {
            txid: cobranca.txid,
            qr_code: cobranca.qr_code,
            qr_code_image: cobranca.qr_code_image,
            pix_copy_paste: cobranca.pix_copy_paste,
            expiracao: cobranca.expiracao
          }
        });

        await invoice.save();
        console.log('✅ Fatura criada:');
        console.log(`   ID: ${invoice._id}`);
        console.log(`   Número: ${invoice.numero}`);
        console.log(`   TXID PIX: ${invoice.pix.txid}\n`);
      }
    }

    console.log('✅ === TODOS OS TESTES PASSARAM === \n');
    console.log('📋 Próximos passos:');
    console.log('   1. Use o QR Code ou PIX Copia e Cola para testar pagamento');
    console.log('   2. Configure webhook EFI para receber notificações');
    console.log('   3. Teste webhook em: POST /api/webhooks/efi/payment\n');

  } catch (error) {
    console.error('\n❌ Erro no teste:', error.message);
    if (error.response?.data) {
      console.error('Detalhes:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexão MongoDB fechada');
  }
}

// Executar teste
testarIntegracao();
