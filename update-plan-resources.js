const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB');
}

require('./src/app/schemas/Plan');

async function updatePlanResources() {
  try {
    await connectDB();

    const Plan = mongoose.model('Plan');

    // 1. Plano Mensal Básico - R$ 49
    const basico = await Plan.findOne({ slug: 'plano-mensal-basico' });
    if (basico) {
      basico.descricao = 'Plano essencial para gestão básica de provedores';
      basico.recursos = [
        '📱 Acesso via App Mobile',
        '👥 Gestão completa de clientes',
        '📞 Abertura e fechamento de chamados',
        '💰 Verificação de status financeiro',
        '📊 Dashboard básico',
        '📍 Alteração de coordenadas e CTO',
        '📄 Compartilhamento de faturas (PIX, boleto)',
        '🔧 Suporte técnico padrão'
      ];
      await basico.save();
      console.log('✅ Plano Mensal Básico atualizado');
    }

    // 2. Plano Mensal Padrão - R$ 99
    const padrao = await Plan.findOne({ slug: 'plano-mensal-padrao' });
    if (padrao) {
      padrao.descricao = 'Plano completo com recursos avançados e relatórios';
      padrao.recursos = [
        '✨ Todos os recursos do Plano Básico',
        '📅 Gestão de chamados (hoje, futuros e atrasados)',
        '📈 Desempenho de técnicos em tempo real',
        '📝 Sistema de notas nos chamados',
        '💳 Baixar faturas diretamente do app',
        '🗺️ Visualização de áreas com rompimento',
        '📊 Histórico de consumo de clientes',
        '🌐 Acesso remoto a roteadores',
        '✏️ Alteração completa de dados cadastrais',
        '🎯 Suporte prioritário'
      ];
      await padrao.save();
      console.log('✅ Plano Mensal Padrão atualizado');
    }

    // 3. Plano Vitalício - R$ 999
    const vitalicio = await Plan.findOne({ slug: 'plano-vitalicio' });
    if (vitalicio) {
      vitalicio.descricao = 'Acesso vitalício com todos os recursos e atualizações futuras';
      vitalicio.recursos = [
        '🌟 Todos os recursos dos planos anteriores',
        '♾️ Acesso vitalício sem mensalidades',
        '🚀 Atualizações futuras incluídas',
        '🎁 Novas funcionalidades sem custo adicional',
        '⚡ API de integração ilimitada',
        '📊 Relatórios personalizados',
        '🔐 Backup automático de dados',
        '👨‍💼 Gerente de conta dedicado',
        '🎓 Treinamento completo da equipe',
        '💎 Suporte VIP 24/7'
      ];
      await vitalicio.save();
      console.log('✅ Plano Vitalício atualizado');
    }

    console.log('\n📦 Resumo dos planos:');
    const plans = await Plan.find({}).sort({ valor_mensal: 1 });
    for (const p of plans) {
      console.log(`\n${p.nome} - R$ ${p.valor_mensal.toFixed(2)}`);
      console.log(`   ${p.descricao}`);
      console.log(`   Recursos: ${p.recursos.length}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

updatePlanResources();
