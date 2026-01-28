const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB');
}

require('./src/app/schemas/Plan');
require('./src/app/schemas/Tenant');

async function recreatePlans() {
  try {
    await connectDB();

    const Plan = mongoose.model('Plan');
    const Tenant = mongoose.model('Tenant');

    // Pegar tenant_id do plano existente
    const existingPlan = await Plan.findOne({});
    if (!existingPlan) {
      console.log('❌ Nenhum plano encontrado para pegar tenant_id');
      return;
    }
    const tenantId = existingPlan.tenant_id;

    // Deletar todos os planos
    await Plan.deleteMany({});
    console.log('🗑️  Planos antigos deletados\n');

    // Criar Plano Mensal Básico
    const basico = await Plan.create({
      tenant_id: tenantId,
      nome: 'Plano Mensal Básico',
      slug: 'plano-mensal-basico',
      descricao: 'Plano essencial para gestão básica de provedores',
      valor_mensal: 49.00,
      periodo: 'mensal',
      recorrente: true,
      limite_clientes: 0,
      recursos: [
        '📱 Acesso via App Mobile',
        '👥 Gestão completa de clientes',
        '📞 Abertura e fechamento de chamados',
        '💰 Verificação de status financeiro',
        '📊 Dashboard básico',
        '📍 Alteração de coordenadas e CTO',
        '📄 Compartilhamento de faturas (PIX, boleto)',
        '🔧 Suporte técnico padrão'
      ],
      destaque: false,
      cor: '#10b981',
      dias_trial: 0,
      ativo: true
    });
    console.log('✅ Plano Mensal Básico criado - R$ 49,00');

    // Criar Plano Mensal Padrão
    const padrao = await Plan.create({
      tenant_id: tenantId,
      nome: 'Plano Mensal Padrão',
      slug: 'plano-mensal-padrao',
      descricao: 'Plano completo com recursos avançados e relatórios',
      valor_mensal: 99.00,
      periodo: 'mensal',
      recorrente: true,
      limite_clientes: 0,
      recursos: [
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
      ],
      destaque: true,
      cor: '#6366f1',
      dias_trial: 0,
      ativo: true
    });
    console.log('✅ Plano Mensal Padrão criado - R$ 99,00');

    // Criar Plano Vitalício
    const vitalicio = await Plan.create({
      tenant_id: tenantId,
      nome: 'Plano Vitalício',
      slug: 'plano-vitalicio',
      descricao: 'Acesso vitalício com todos os recursos e atualizações futuras',
      valor_mensal: 999.00,
      periodo: 'vitalicio',
      recorrente: false,
      limite_clientes: 0,
      recursos: [
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
      ],
      destaque: false,
      cor: '#f59e0b',
      dias_trial: 0,
      ativo: true
    });
    console.log('✅ Plano Vitalício criado - R$ 999,00');

    // Atualizar tenant Updata para usar Plano Básico
    await Tenant.updateOne(
      { 'provedor.nome': /updata/i },
      {
        $set: {
          'assinatura.plano': 'plano-mensal-basico',
          'assinatura.plano_nome': 'Plano Mensal Básico',
          'assinatura.valor_mensal': 49.00
        }
      }
    );
    console.log('✅ Tenant Updata atualizado para Plano Básico');

    console.log('\n📦 Planos criados com sucesso!');
    console.log('\n💰 Resumo:');
    console.log('   1. Plano Mensal Básico: R$ 49,00 (8 recursos)');
    console.log('   2. Plano Mensal Padrão: R$ 99,00 (10 recursos) ⭐ DESTAQUE');
    console.log('   3. Plano Vitalício: R$ 999,00 (10 recursos)');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

recreatePlans();
