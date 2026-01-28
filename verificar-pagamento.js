/**
 * Verificar pagamento PIX
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Integration = require('./src/app/schemas/Integration');

const TXID = 'MKY1O8RKCFLQS1747KNABCDEFG'; // TXID da cobrança

async function verificarPagamento() {
  console.log('\n🔍 === VERIFICANDO PAGAMENTO === \n');

  try {
    await mongoose.connect(process.env.MONGODB_URL);

    const integration = await Integration.findOne({ type: 'efi' });
    const tenantId = integration.tenant_id;

    const EFIService = require('./src/app/services/EFIService');

    console.log(`Consultando cobrança: ${TXID}\n`);
    
    const cobranca = await EFIService.consultarCobranca(tenantId, TXID);

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📊 STATUS DA COBRANÇA:\n');
    console.log(`   TXID: ${cobranca.txid}`);
    console.log(`   Status: ${cobranca.status}`);
    console.log(`   Valor Original: R$ ${cobranca.valor.original}`);
    
    if (cobranca.pix && cobranca.pix.length > 0) {
      console.log('\n💰 PAGAMENTO CONFIRMADO!\n');
      cobranca.pix.forEach((pix, index) => {
        console.log(`   Pagamento ${index + 1}:`);
        console.log(`   - Valor: R$ ${pix.valor}`);
        console.log(`   - Horário: ${pix.horario}`);
        console.log(`   - End to End: ${pix.endToEndId}`);
        console.log(`   - Pagador: ${pix.pagador?.nome || 'N/A'}`);
        if (pix.pagador?.cpf) console.log(`   - CPF: ${pix.pagador.cpf}`);
      });
    } else {
      console.log('\n⏳ Pagamento ainda não confirmado');
      console.log('   Status:', cobranca.status);
    }

    console.log('\n═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await mongoose.connection.close();
  }
}

verificarPagamento();
