const mongoose = require('mongoose');
require('dotenv').config();

require('./src/app/schemas/Tenant');
require('./src/app/schemas/Plan');

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri);
  console.log('Connected');

  const Plan = mongoose.model('Plan');
  const Tenant = mongoose.model('Tenant');

  const plans = await Plan.find({}).lean();
  console.log('\n=== PLANS ===');
  plans.forEach(p => console.log(' -', p.slug, '|', p.nome, '| periodo:', p.periodo, '| valor:', p.valor_mensal));

  const tenants = await Tenant.find({}).lean();
  console.log('\n=== TENANTS ===');
  tenants.forEach(t => console.log(
    ' -', t.provedor?.nome,
    '| plano:', t.assinatura?.plano,
    '| plano_nome:', t.assinatura?.plano_nome,
    '| plano_atual:', t.plano_atual
  ));

  await mongoose.connection.close();
  console.log('\nDone');
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
