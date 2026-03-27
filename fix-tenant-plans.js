/**
 * fix-tenant-plans.js
 * 
 * Migra os tenants Manaos e Updata para os planos corretos:
 * - Manaos  → plano Mensal (periodo = 'mensal')
 * - Updata  → plano Vitalício (periodo = 'vitalicio')
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('./src/app/schemas/Tenant');
require('./src/app/schemas/Plan');
require('./src/app/schemas/Subscription');

async function run() {
  const mongoUri = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado ao MongoDB:', mongoUri);

  const Plan = mongoose.model('Plan');
  const Tenant = mongoose.model('Tenant');
  const Subscription = mongoose.model('Subscription');

  // ─── Listar todos os planos disponíveis ───────────────────────────────────
  const allPlans = await Plan.find({ ativo: true }).lean();
  console.log('\n📋 Planos disponíveis:');
  allPlans.forEach(p =>
    console.log(`   • ${p.nome} (slug: ${p.slug}, periodo: ${p.periodo})`)
  );

  // ─── Encontrar plano Mensal ───────────────────────────────────────────────
  const planoMensal =
    allPlans.find(p => p.periodo === 'mensal') ||
    allPlans.find(p => /mensal/i.test(p.nome));

  if (!planoMensal) {
    console.error('\n❌ Nenhum plano Mensal encontrado. Abortando.');
    await mongoose.connection.close();
    return;
  }
  console.log(`\n✅ Plano Mensal identificado: ${planoMensal.nome} (${planoMensal.slug})`);

  // ─── Encontrar plano Vitalício ────────────────────────────────────────────
  const planoVitalicio =
    allPlans.find(p => p.periodo === 'vitalicio') ||
    allPlans.find(p => /vital/i.test(p.nome));

  if (!planoVitalicio) {
    console.error('\n❌ Nenhum plano Vitalício encontrado. Abortando.');
    await mongoose.connection.close();
    return;
  }
  console.log(`✅ Plano Vitalício identificado: ${planoVitalicio.nome} (${planoVitalicio.slug})`);

  // ─── Atualizar Manaos ─────────────────────────────────────────────────────
  const manaos = await Tenant.findOne({ 'provedor.nome': /manaos/i });
  if (manaos) {
    console.log(`\n🔄 Atualizando Manaos (${manaos.provedor.nome})...`);
    console.log(`   Plano atual: ${manaos.assinatura?.plano || 'não definido'}`);

    manaos.plano_atual          = planoMensal.slug;
    manaos.assinatura.plano     = planoMensal.slug;
    manaos.assinatura.plano_nome = planoMensal.nome;
    manaos.assinatura.valor_mensal = planoMensal.valor_mensal;
    manaos.assinatura.ativa     = true;
    await manaos.save();
    console.log(`   ✅ Manaos → ${planoMensal.nome}`);

    // Atualizar assinatura ativa no collection Subscription (se existir)
    const subManaos = await Subscription.findOne({
      tenant_id: manaos._id,
      status: { $in: ['ativa', 'trial', 'inadimplente', 'suspensa'] }
    });
    if (subManaos) {
      subManaos.plan_slug = planoMensal.slug;
      subManaos.plan_name = planoMensal.nome;
      subManaos.valor_mensal = planoMensal.valor_mensal;
      await subManaos.save();
      console.log(`   ✅ Subscription Manaos atualizada`);
    }
  } else {
    console.log('\n⚠️  Tenant Manaos não encontrado');
  }

  // ─── Atualizar Updata ─────────────────────────────────────────────────────
  const updata = await Tenant.findOne({ 'provedor.nome': /updata/i });
  if (updata) {
    console.log(`\n🔄 Atualizando Updata (${updata.provedor.nome})...`);
    console.log(`   Plano atual: ${updata.assinatura?.plano || 'não definido'}`);

    updata.plano_atual           = planoVitalicio.slug;
    updata.assinatura.plano      = planoVitalicio.slug;
    updata.assinatura.plano_nome = planoVitalicio.nome;
    updata.assinatura.valor_mensal = planoVitalicio.valor_mensal;
    updata.assinatura.ativa      = true;
    await updata.save();
    console.log(`   ✅ Updata → ${planoVitalicio.nome}`);

    // Atualizar assinatura ativa no collection Subscription (se existir)
    const subUpdata = await Subscription.findOne({
      tenant_id: updata._id,
      status: { $in: ['ativa', 'trial', 'inadimplente', 'suspensa'] }
    });
    if (subUpdata) {
      subUpdata.plan_slug = planoVitalicio.slug;
      subUpdata.plan_name = planoVitalicio.nome;
      subUpdata.valor_mensal = planoVitalicio.valor_mensal;
      await subUpdata.save();
      console.log(`   ✅ Subscription Updata atualizada`);
    }
  } else {
    console.log('\n⚠️  Tenant Updata não encontrado');
  }

  // ─── Verificação final ────────────────────────────────────────────────────
  console.log('\n📊 Estado final dos tenants:');
  const tenants = await Tenant.find({}).lean();
  for (const t of tenants) {
    const planSlug = t.assinatura?.plano;
    const plan = allPlans.find(p => p.slug === planSlug);
    const status = plan ? '✅' : '❌ PLANO NÃO ENCONTRADO';
    console.log(`   ${status} ${t.provedor?.nome} → ${planSlug || 'sem plano'} (${plan?.nome || 'N/A'})`);
  }

  await mongoose.connection.close();
  console.log('\n✅ Concluído.');
}

run().catch(e => {
  console.error('❌ Erro fatal:', e.message);
  process.exit(1);
});
