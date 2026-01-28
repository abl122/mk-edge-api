/**
 * Teste de Fluxo Completo de Assinatura
 * 
 * Este script testa:
 * 1. Criar tenant
 * 2. Criar subscription
 * 3. Gerar fatura com PIX
 * 4. Verificar status
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('./src/app/schemas/Tenant');
const Subscription = require('./src/app/schemas/Subscription');
const Plan = require('./src/app/schemas/Plan');
const InvoiceService = require('./src/app/services/InvoiceService');
const EFIService = require('./src/app/services/EFIService');

async function testeFluxoCompleto() {
  console.log('\n🔄 === TESTE FLUXO COMPLETO DE ASSINATURA === \n');

  try {
    await mongoose.connect(process.env.MONGODB_URL);

    // 1. Buscar ou criar tenant de teste
    console.log('1️⃣ Buscando tenant de teste...');
    let tenant = await Tenant.findOne({ cnpj: '11222333000181' });
    
    if (!tenant) {
      console.log('   Criando novo tenant...');
      tenant = new Tenant({
        cnpj: '11222333000181',
        razao_social: 'Empresa Teste Assinatura LTDA',
        nome_fantasia: 'Teste Assinatura',
        email: 'teste@assinatura.com',
        telefone: '11999999999',
        ativo: true
      });
      await tenant.save();
      console.log(`   ✅ Tenant criado: ${tenant._id}\n`);
    } else {
      console.log(`   ✅ Tenant encontrado: ${tenant.nome_fantasia} (${tenant._id})\n`);
    }

    // 2. Buscar plano
    console.log('2️⃣ Buscando plano...');
    let plan = await Plan.findOne({ slug: 'basico' });
    
    if (!plan) {
      console.log('   ⚠️  Plano "basico" não encontrado, usando primeiro disponível...');
      plan = await Plan.findOne();
    }
    
    if (!plan) {
      console.log('   ❌ Nenhum plano encontrado! Crie um plano primeiro.\n');
      return;
    }
    
    console.log(`   ✅ Plano: ${plan.nome} - R$ ${plan.preco.toFixed(2)}/mês\n`);

    // 3. Criar ou buscar subscription
    console.log('3️⃣ Criando subscription...');
    let subscription = await Subscription.findOne({ tenant_id: tenant._id });
    
    if (!subscription) {
      subscription = new Subscription({
        tenant_id: tenant._id,
        plano: plan.slug,
        plan_name: plan.nome,
        status: 'ativa',
        data_inicio: new Date(),
        data_vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 dias
        renovacao_automatica: true,
        ciclo_cobranca: 'mensal'
      });
      await subscription.save();
      console.log(`   ✅ Subscription criada: ${subscription._id}\n`);
    } else {
      console.log(`   ✅ Subscription encontrada: ${subscription._id}\n`);
    }

    // 4. Gerar fatura
    console.log('4️⃣ Gerando fatura...');
    const dataVencimento = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 dias
    
    const invoice = await InvoiceService.gerarFatura(
      subscription._id,
      dataVencimento,
      {
        valor: plan.preco,
        descricao: `${plan.nome} - ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
      }
    );
    
    console.log(`   ✅ Fatura gerada: ${invoice.numero}`);
    console.log(`   Valor: R$ ${invoice.valor.toFixed(2)}`);
    console.log(`   Vencimento: ${invoice.data_vencimento.toLocaleDateString('pt-BR')}\n`);

    // 5. Gerar PIX via EFI
    console.log('5️⃣ Gerando PIX via EFI...');
    try {
      const cobrancaPix = await EFIService.criarCobrancaPix(tenant._id, {
        cnpj: tenant.cnpj?.replace(/\D/g, ''),
        cpf: null,
        nome: tenant.nome_fantasia || tenant.razao_social,
        valor: invoice.valor,
        expiracao: 86400, // 24 horas
        descricao: invoice.descricao,
        numero_fatura: invoice.numero
      });

      // Atualizar fatura com dados do PIX
      invoice.pix = {
        txid: cobrancaPix.txid,
        qr_code: cobrancaPix.qr_code,
        qr_code_image: cobrancaPix.qr_code_image,
        pix_copy_paste: cobrancaPix.pix_copy_paste,
        expiracao: cobrancaPix.expiracao
      };
      await invoice.save();

      console.log(`   ✅ PIX gerado com sucesso!`);
      console.log(`   TXID: ${cobrancaPix.txid}\n`);
      
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('📱 PIX COPIA E COLA:\n');
      console.log(`${cobrancaPix.pix_copy_paste}\n`);
      console.log('═══════════════════════════════════════════════════════\n');

    } catch (error) {
      console.log(`   ⚠️  Erro ao gerar PIX: ${error.message}`);
      console.log('   (Fatura criada mas sem PIX)\n');
    }

    // Resumo final
    console.log('✅ FLUXO COMPLETO:\n');
    console.log(`   📦 Tenant: ${tenant.nome_fantasia}`);
    console.log(`   📋 Plano: ${plan.nome} (R$ ${plan.preco.toFixed(2)})`);
    console.log(`   📝 Subscription: ${subscription._id}`);
    console.log(`   💰 Fatura: ${invoice.numero} (${invoice.status})`);
    if (invoice.pix?.txid) {
      console.log(`   💳 PIX: ${invoice.pix.txid}`);
    }
    console.log('\n');

    if (invoice.pix?.txid) {
      console.log('📋 Para testar o pagamento:');
      console.log('   1. Copie o PIX Copia e Cola acima');
      console.log('   2. Pague via app bancário');
      console.log('   3. O webhook EFI notificará automaticamente');
      console.log('   4. A fatura será marcada como paga\n');
    }

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
  }
}

testeFluxoCompleto();
