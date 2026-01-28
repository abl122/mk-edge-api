const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB');
}

require('./src/app/schemas/Plan');

async function addGPSFeature() {
  try {
    await connectDB();

    const Plan = mongoose.model('Plan');

    // Adicionar recurso de GPS no Plano Básico
    const basico = await Plan.findOne({ slug: 'plano-mensal-basico' });
    if (basico) {
      basico.recursos = [
        '📱 Acesso via App Mobile',
        '👥 Gestão completa de clientes',
        '📞 Abertura e fechamento de chamados',
        '💰 Verificação de status financeiro',
        '📊 Dashboard básico',
        '📍 Alteração de coordenadas e CTO',
        '🗺️ Navegação GPS para clientes',
        '📄 Compartilhamento de faturas (PIX, boleto)',
        '🔧 Suporte técnico padrão'
      ];
      await basico.save();
      console.log('✅ Plano Mensal Básico atualizado (9 recursos)');
    }

    // Plano Padrão já tem "Todos os recursos do Básico"
    const padrao = await Plan.findOne({ slug: 'plano-mensal-padrao' });
    if (padrao) {
      console.log('✅ Plano Mensal Padrão já inclui recursos do Básico');
    }

    console.log('\n📦 Recurso de navegação GPS adicionado aos planos!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

addGPSFeature();
