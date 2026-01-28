const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB');
}

require('./src/app/schemas/Tenant');

async function forceFixPlanoNome() {
  try {
    await connectDB();

    const Tenant = mongoose.model('Tenant');

    // Atualizar diretamente
    const result = await Tenant.updateOne(
      { 'provedor.nome': /updata/i },
      { 
        $set: { 
          'assinatura.plano_nome': 'Assinatura Mensal'
        }
      }
    );

    console.log('\n📊 Resultado:', result);
    
    // Verificar
    const updata = await Tenant.findOne({ 'provedor.nome': /updata/i });
    console.log('\n✅ Verificação após update:');
    console.log('   plano:', updata.assinatura.plano);
    console.log('   plano_nome:', updata.assinatura.plano_nome);
    console.log('   valor_mensal:', updata.assinatura.valor_mensal);

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

forceFixPlanoNome();
