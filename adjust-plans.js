const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB');
}

require('./src/app/schemas/Plan');
require('./src/app/schemas/Tenant');

async function adjustPlans() {
  try {
    await connectDB();

    const Plan = mongoose.model('Plan');
    const Tenant = mongoose.model('Tenant');

    // 1. Atualizar plano existente
    console.log('\n📝 Atualizando Assinatura Mensal...');
    const planoMensal = await Plan.findOne({ slug: 'assinatura-mensal' });
    
    if (planoMensal) {
      planoMensal.nome = 'Plano Mensal Básico';
      planoMensal.slug = 'plano-mensal-basico';
      await planoMensal.save();
      console.log('✅ Plano atualizado:', planoMensal.nome);

      // Atualizar tenants que usam este plano
      const updateResult = await Tenant.updateMany(
        { 'assinatura.plano': 'assinatura-mensal' },
        { 
          $set: { 
            'assinatura.plano': 'plano-mensal-basico',
            'assinatura.plano_nome': 'Plano Mensal Básico'
          } 
        }
      );
      console.log(`   Tenants atualizados: ${updateResult.modifiedCount}`);
    }

    // 2. Criar novo plano Padrão
    console.log('\n📝 Criando Plano Mensal Padrão...');
    
    const tenantId = planoMensal.tenant_id; // Usar o mesmo tenant_id
    
    const planoPadrao = await Plan.create({
      tenant_id: tenantId,
      nome: 'Plano Mensal Padrão',
      slug: 'plano-mensal-padrao',
      descricao: 'Plano mensal padrão com mais recursos',
      valor_mensal: 99.00,
      periodo: 'mensal',
      recorrente: true,
      limite_clientes: 0,
      recursos: [
        'Gestão completa de clientes',
        'Relatórios avançados',
        'Integrações API',
        'Suporte prioritário'
      ],
      destaque: false,
      cor: '#6366f1',
      dias_trial: 0,
      ativo: true
    });
    
    console.log('✅ Plano criado:', planoPadrao.nome);

    // 3. Listar todos os planos
    console.log('\n📦 Planos disponíveis:');
    const plans = await Plan.find({}).sort({ valor_mensal: 1 });
    for (const p of plans) {
      console.log(`   - ${p.nome} (${p.slug}): R$ ${p.valor_mensal.toFixed(2)}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexão fechada');
  }
}

adjustPlans();
