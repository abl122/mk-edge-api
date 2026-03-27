/**
 * migrate-plan-slugs.js
 *
 * Normaliza slugs legados:
 * - plano-mensal-padrao -> plano-mensal
 * - plano-vitalicio -> plano-anual
 *
 * Uso:
 *   node migrate-plan-slugs.js --dry-run
 *   node migrate-plan-slugs.js --apply
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('./src/app/schemas/Plan');
require('./src/app/schemas/Tenant');
require('./src/app/schemas/Subscription');

const SLUG_MIGRATIONS = [
  {
    from: 'plano-mensal-padrao',
    to: 'plano-mensal',
    updatePeriodFrom: null,
    updatePeriodTo: null
  },
  {
    from: 'plano-vitalicio',
    to: 'plano-anual',
    updatePeriodFrom: 'vitalicio',
    updatePeriodTo: 'anual'
  }
];

const shouldApply = process.argv.includes('--apply');
const isDryRun = !shouldApply;

const connect = async () => {
  const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log(`✅ Conectado ao MongoDB: ${mongoUri}`);
};

const updatePlans = async (Plan, migration) => {
  const plans = await Plan.find({ slug: migration.from });
  let renamed = 0;
  let skippedConflicts = 0;

  for (const plan of plans) {
    const conflict = await Plan.findOne({
      tenant_id: plan.tenant_id,
      slug: migration.to,
      _id: { $ne: plan._id }
    });

    if (conflict) {
      skippedConflicts += 1;
      console.log(`⚠️ Conflito no tenant ${plan.tenant_id}: já existe ${migration.to}, plano legado ${plan._id} não será renomeado`);
      continue;
    }

    if (!isDryRun) {
      plan.slug = migration.to;
      if (migration.updatePeriodFrom && plan.periodo === migration.updatePeriodFrom) {
        plan.periodo = migration.updatePeriodTo;
      }
      await plan.save();
    }

    renamed += 1;
  }

  return { found: plans.length, renamed, skippedConflicts };
};

const updateTenants = async (Tenant, migration) => {
  if (isDryRun) {
    const planoAtualCount = await Tenant.countDocuments({ plano_atual: migration.from });
    const assinaturaPlanoCount = await Tenant.countDocuments({ 'assinatura.plano': migration.from });
    return {
      planoAtualCount,
      assinaturaPlanoCount,
      modifiedPlanoAtual: planoAtualCount,
      modifiedAssinatura: assinaturaPlanoCount
    };
  }

  const planoAtualResult = await Tenant.updateMany(
    { plano_atual: migration.from },
    { $set: { plano_atual: migration.to } }
  );

  const assinaturaSet = {
    'assinatura.plano': migration.to
  };

  if (migration.to === 'plano-anual') {
    assinaturaSet['assinatura.plano_nome'] = 'Plano Anual';
  }

  const assinaturaResult = await Tenant.updateMany(
    { 'assinatura.plano': migration.from },
    { $set: assinaturaSet }
  );

  return {
    modifiedPlanoAtual: planoAtualResult.modifiedCount || 0,
    modifiedAssinatura: assinaturaResult.modifiedCount || 0
  };
};

const updateSubscriptions = async (Subscription, migration) => {
  if (isDryRun) {
    const count = await Subscription.countDocuments({ plan_slug: migration.from });
    return { modified: count };
  }

  const setPayload = {
    plan_slug: migration.to
  };

  if (migration.to === 'plano-anual') {
    setPayload.plan_name = 'Plano Anual';
  }

  const result = await Subscription.updateMany(
    { plan_slug: migration.from },
    { $set: setPayload }
  );

  if (migration.updatePeriodFrom && migration.updatePeriodTo) {
    await Subscription.updateMany(
      {
        plan_slug: migration.to,
        ciclo_cobranca: migration.updatePeriodFrom
      },
      {
        $set: {
          ciclo_cobranca: migration.updatePeriodTo
        }
      }
    );
  }

  return { modified: result.modifiedCount || 0 };
};

async function run() {
  try {
    await connect();

    const Plan = mongoose.model('Plan');
    const Tenant = mongoose.model('Tenant');
    const Subscription = mongoose.model('Subscription');

    console.log(`\n🚀 Modo: ${isDryRun ? 'DRY-RUN (sem alterações)' : 'APPLY (alterando dados)'}`);

    for (const migration of SLUG_MIGRATIONS) {
      console.log(`\n🔁 ${migration.from} -> ${migration.to}`);

      const planStats = await updatePlans(Plan, migration);
      const tenantStats = await updateTenants(Tenant, migration);
      const subscriptionStats = await updateSubscriptions(Subscription, migration);

      console.log(`   Planos encontrados: ${planStats.found}`);
      console.log(`   Planos renomeados: ${planStats.renamed}`);
      console.log(`   Conflitos ignorados: ${planStats.skippedConflicts}`);
      console.log(`   Tenants.plano_atual atualizados: ${tenantStats.modifiedPlanoAtual}`);
      console.log(`   Tenants.assinatura.plano atualizados: ${tenantStats.modifiedAssinatura}`);
      console.log(`   Subscriptions.plan_slug atualizados: ${subscriptionStats.modified}`);
    }

    console.log('\n✅ Migração finalizada');
  } catch (error) {
    console.error('\n❌ Erro na migração:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexão encerrada');
  }
}

run();
