#!/usr/bin/env node

/**
 * Script de inicialização do tenant padrão
 * Executa na inicialização do container para configurar o tenant se não existir
 */

const mongoose = require('mongoose');

/**
 * Inicializa o tenant padrão
 */
async function initDefaultTenant() {
  try {
    // Conectar ao MongoDB
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';
    
    console.log('🌱 Conectando ao MongoDB para inicialização...');
    
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000
    });
    
    console.log('✅ Conectado ao MongoDB');
    
    // Verificar se tenant padrão existe
    const tenantId = process.env.DEFAULT_TENANT_ID;
    if (!tenantId) {
      console.log('⚠️  DEFAULT_TENANT_ID não definido, pulando inicialização');
      await mongoose.connection.close();
      process.exit(0);
    }
    
    const db = mongoose.connection.db;
    const tenantsCollection = db.collection('tenants');
    
    const existingTenant = await tenantsCollection.findOne({ _id: new mongoose.Types.ObjectId(tenantId) });
    
    if (existingTenant) {
      console.log('✅ Tenant padrão já existe', existingTenant.nome || tenantId);
    } else {
      // Criar tenant padrão
      const defaultTenant = {
        _id: new mongoose.Types.ObjectId(tenantId),
        nome: process.env.DEFAULT_TENANT_NAME || 'Default Tenant',
        dominio: process.env.DEFAULT_TENANT_DOMAIN || 'example.com',
        email: process.env.DEFAULT_TENANT_EMAIL || 'admin@example.com',
        telefone: process.env.DEFAULT_TENANT_PHONE || '0000000000',
        cnpj: process.env.DEFAULT_TENANT_CNPJ || '00.000.000/0000-00',
        
        // Configuração do agente (provedor)
        agente: {
          url: process.env.DEFAULT_AGENT_URL || 'https://provedor.example.com/api.php',
          token: process.env.DEFAULT_AGENT_TOKEN || 'token-secreto',
          ativo: true,
          config: {
            timeout: 15000,
            retry: true,
            max_retries: 2
          },
          encryption_key: process.env.AGENT_ENCRYPTION_KEY || null,
          encrypt_queries: process.env.AGENT_ENCRYPT_QUERIES === 'true',
          ultimo_ping: null,
          versao: null
        },
        
        // Configurações de tenant
        ativo: true,
        data_criacao: new Date(),
        ultimo_acesso: null,
        
        // Campos adicionais
        planos: [],
        integrações: [],
        configuracoes: {
          max_usuarios: 100,
          max_clientes: 10000,
          limite_requisicoes_por_min: 100
        }
      };
      
      await tenantsCollection.insertOne(defaultTenant);
      console.log('✅ Tenant padrão criado:', defaultTenant.nome);
    }
    
    // Criar admin padrão se não existir (opcional)
    const usersCollection = db.collection('users');
    const adminLogin = process.env.DEFAULT_ADMIN_LOGIN || 'admin';
    const existingAdmin = await usersCollection.findOne({ login: adminLogin, tenant_id: tenantId });
    
    if (existingAdmin) {
      console.log('✅ Usuário admin já existe:', adminLogin);
    } else {
      console.log('ℹ️  Admin padrão não será criado (será criado pelo app normalmente)');
    }
    
    console.log('🎉 Inicialização do tenant concluída com sucesso!');
    
    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erro durante inicialização do tenant', error.message);
    
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  }
}

// Executar inicialização
initDefaultTenant();
