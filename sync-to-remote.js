const mongoose = require('mongoose');
require('dotenv').config();

// IMPORTANTE: Configure as URLs no .env ou altere aqui
const LOCAL_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mkedgetenants';
const REMOTE_URI = process.env.MONGODB_REMOTE_URI || 'mongodb://usuario:senha@IP:27017/mkedgetenants';

async function syncToRemote() {
  try {
    console.log('🔄 Iniciando sincronização LOCAL → REMOTO\n');

    // Conectar ao LOCAL
    const localConn = await mongoose.createConnection(LOCAL_URI).asConnected;
    console.log('✅ Conectado ao MongoDB LOCAL');

    // Conectar ao REMOTO
    const remoteConn = await mongoose.createConnection(REMOTE_URI).asConnected;
    console.log('✅ Conectado ao MongoDB REMOTO\n');

    // Importar schemas
    require('./src/app/schemas/Tenant');
    require('./src/app/schemas/Plan');
    require('./src/app/schemas/Invoice');
    require('./src/app/schemas/User');
    require('./src/app/schemas/Integration');

    const collections = [
      { name: 'tenants', model: 'Tenant' },
      { name: 'plans', model: 'Plan' },
      { name: 'invoices', model: 'Invoice' },
      { name: 'users', model: 'User' },
      { name: 'integrations', model: 'Integration' }
    ];

    for (const coll of collections) {
      console.log(`\n📦 Sincronizando: ${coll.name.toUpperCase()}`);
      console.log('─'.repeat(50));

      const LocalModel = localConn.model(coll.model);
      const RemoteModel = remoteConn.model(coll.model);

      // Buscar dados locais
      const localData = await LocalModel.find({}).lean();
      console.log(`   Local: ${localData.length} documentos`);

      // Buscar dados remotos
      const remoteData = await RemoteModel.find({}).lean();
      console.log(`   Remoto: ${remoteData.length} documentos`);

      if (localData.length === 0) {
        console.log('   ⚠️  Nenhum dado local para sincronizar');
        continue;
      }

      // Backup remoto (opcional)
      console.log('   💾 Fazendo backup dos dados remotos...');
      const backupData = await RemoteModel.find({}).lean();

      // Sincronizar cada documento
      let updated = 0;
      let created = 0;
      let errors = 0;

      for (const doc of localData) {
        try {
          const existing = await RemoteModel.findById(doc._id);
          
          if (existing) {
            // Atualizar documento existente
            await RemoteModel.findByIdAndUpdate(doc._id, doc, { 
              new: true,
              runValidators: true,
              overwrite: true // Substitui completamente
            });
            updated++;
          } else {
            // Criar novo documento
            await RemoteModel.create(doc);
            created++;
          }
        } catch (err) {
          console.error(`   ❌ Erro no documento ${doc._id}:`, err.message);
          errors++;
        }
      }

      console.log(`\n   📊 Resultado:`);
      console.log(`      ✅ Atualizados: ${updated}`);
      console.log(`      🆕 Criados: ${created}`);
      if (errors > 0) {
        console.log(`      ❌ Erros: ${errors}`);
      }
    }

    console.log('\n\n✨ Sincronização concluída!');
    console.log('\n📋 Verificações importantes:');
    console.log('   1. Verifique os logs acima para erros');
    console.log('   2. Teste a aplicação no servidor remoto');
    console.log('   3. Verifique se todos os campos novos estão presentes');
    console.log('\n💡 Campos novos adicionados nesta sessão:');
    console.log('   - Tenant.assinatura.plano_nome (String)');
    console.log('   - Plan schema completo (nova collection)');
    console.log('   - Invoice schema completo (nova collection)');
    console.log('   - Integration schema (nova collection)');

    await localConn.close();
    await remoteConn.close();
    console.log('\n👋 Conexões fechadas');

  } catch (error) {
    console.error('\n❌ Erro na sincronização:', error);
    process.exit(1);
  }
}

// Executar
console.log('⚠️  ATENÇÃO: Este script vai sincronizar dados do LOCAL para REMOTO');
console.log('⚠️  Certifique-se de ter configurado MONGODB_REMOTE_URI no .env\n');

syncToRemote();
