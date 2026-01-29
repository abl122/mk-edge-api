const mongoose = require('mongoose');
const fs = require('fs');

async function main() {
  try {
    const conn = await mongoose.createConnection(
      process.env.MONGODB_URL || 'mongodb://mongo:27017/mkedgetenants'
    ).asPromise();
    
    console.log('\n========================================');
    console.log('TESTE DE INTEGRACOES');
    console.log('========================================\n');
    
    const db = conn.db;
    const integrations = await db.collection('integrations').find({}).toArray();
    
    for (const integration of integrations) {
      console.log(`\n--- ${integration.type.toUpperCase()} ---`);
      
      const config = integration[integration.type];
      
      if (!config) {
        console.log('❌ Configuracao nao encontrada');
        continue;
      }
      
      console.log(`Status: ${config.enabled ? '✅ Habilitado' : '❌ Desabilitado'}`);
      
      // Verifica campos criticos por tipo
      switch(integration.type) {
        case 'sms':
          console.log(`Endpoint: ${config.endpoint || config.url}`);
          console.log(`Usuario: ${config.username || config.user}`);
          console.log(`Token: ${config.token ? '✅ Presente' : '❌ Ausente'}`);
          console.log(`Password: ${config.password ? '✅ Presente' : '❌ Ausente'}`);
          break;
          
        case 'zapi':
          console.log(`Instance ID: ${config.instanceId ? '✅ Presente' : '❌ Ausente'}`);
          console.log(`Instance Token: ${config.instanceToken ? '✅ Presente' : '❌ Ausente'}`);
          console.log(`Security Token: ${config.securityToken ? '✅ Presente' : '❌ Ausente'}`);
          break;
          
        case 'efi':
          console.log(`Modo: ${config.sandbox ? 'Sandbox' : 'Producao'}`);
          
          const env = config.sandbox ? 'homologacao' : 'producao';
          const certPath = config[env]?.certificate_path;
          
          console.log(`\nAmbiente ${env}:`);
          console.log(`  Client ID: ${config[env]?.client_id ? '✅ Presente' : '❌ Ausente'}`);
          console.log(`  Client Secret: ${config[env]?.client_secret ? '✅ Presente' : '❌ Ausente'}`);
          console.log(`  PIX Key: ${config[env]?.pix_key ? '✅ Presente' : '❌ Ausente'}`);
          console.log(`  Certificado: ${certPath}`);
          
          if (certPath) {
            if (fs.existsSync(certPath)) {
              const stats = fs.statSync(certPath);
              console.log(`  ✅ Arquivo existe (${stats.size} bytes)`);
            } else {
              console.log(`  ❌ Arquivo NAO encontrado!`);
            }
          }
          break;
          
        case 'email':
          console.log(`Host: ${config.host || config.smtp_host}`);
          console.log(`Port: ${config.port || config.smtp_port}`);
          console.log(`Usuario: ${config.username || config.usuario || config.user}`);
          console.log(`Password: ${config.password || config.senha ? '✅ Presente' : '❌ Ausente'}`);
          console.log(`From: ${config.from_email || config.from}`);
          break;
      }
    }
    
    console.log('\n========================================');
    console.log('DIAGNOSTICO CONCLUIDO');
    console.log('========================================\n');
    
    await conn.close();
  } catch (error) {
    console.error('ERRO:', error.message);
    process.exit(1);
  }
}

main();
