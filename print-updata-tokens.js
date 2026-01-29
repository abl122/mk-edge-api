const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('✅ Conectado ao MongoDB:', mongoUri);
}

require('./src/app/schemas/Tenant');

function mask(v) {
  if (v == null) return '<empty>';
  const s = String(v);
  if (process.env.SHOW_SECRET === 'true' || process.argv.includes('--show')) return s;
  if (s.length <= 6) return '*'.repeat(s.length);
  return '*'.repeat(Math.max(0, s.length - 6)) + s.slice(-6);
}

function findSecrets(obj, base = '') {
  const results = [];
  if (!obj || typeof obj !== 'object') return results;
  const keys = Object.keys(obj);
  for (const k of keys) {
    const v = obj[k];
    const path = base ? `${base}.${k}` : k;
    if (/token|senha|password|secret|key|apikey|api_key|p$/i.test(k)) {
      results.push({ path, value: mask(v) });
    }
    if (v && typeof v === 'object') {
      results.push(...findSecrets(v, path));
    }
  }
  return results;
}

async function run() {
  try {
    await connectDB();
    const Tenant = mongoose.model('Tenant');
    const updata = await Tenant.findOne({ 'provedor.nome': /updata/i }).lean();
    if (!updata) {
      console.error('❌ Tenant Updata não encontrado');
      process.exit(1);
    }

    console.log('\n📋 Tenant encontrado: %s (CNPJ: %s)\n', updata.provedor?.nome || 'N/A', updata.provedor?.cnpj || 'N/A');

    const secrets = findSecrets(updata);
    if (!secrets.length) {
      console.log('🔎 Nenhum campo com padrão de segredo/token encontrado automaticamente. Você pode inspecionar manualmente o objeto.');
      console.log('\nObjeto tenant (resumido):', Object.keys(updata).join(', '));
    } else {
      console.log('🔐 Campos detectados (valores mascarados):\n');
      for (const s of secrets) {
        console.log(` - ${s.path}: ${s.value}`);
      }
      console.log('\n⚠️ Para ver valores completos, execute com a variável de ambiente SHOW_SECRET=true ou o argumento --show (faça isso apenas em ambiente seguro).');
    }

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await mongoose.connection.close();
  }
}

run();
