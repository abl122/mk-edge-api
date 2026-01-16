#!/usr/bin/env node

/**
 * Script para criar tenant padrão usando variáveis de ambiente
 * Usado no startup do Docker/Kubernetes
 * 
 * Variáveis de ambiente esperadas:
 * - DEFAULT_TENANT_ID
 * - DEFAULT_TENANT_NAME
 * - DEFAULT_TENANT_CNPJ
 * - DEFAULT_TENANT_EMAIL
 * - DEFAULT_TENANT_PHONE
 * - DEFAULT_TENANT_DOMAIN
 * - DEFAULT_AGENT_URL
 * - DEFAULT_AGENT_TOKEN
 * - DEFAULT_ADMIN_LOGIN
 * - DEFAULT_ADMIN_PASSWORD
 * - DEFAULT_ADMIN_EMAIL
 * - MONGODB_URL
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Tenant = require('../src/app/schemas/Tenant');
const User = require('../src/app/schemas/User');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function initializeDefaultTenant() {
  try {
    console.log('\n🌱 Inicializando tenant padrão...\n');

    // Conecta ao MongoDB
    console.log(`📦 Conectando ao MongoDB: ${MONGODB_URL}`);
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Conectado ao MongoDB\n');

    // ==================== CRIAR TENANT ====================

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 CRIANDO TENANT PADRÃO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const tenantId = process.env.DEFAULT_TENANT_ID || '63dd998b885eb427c8c51958';
    const tenantName = process.env.DEFAULT_TENANT_NAME || 'Updata Telecom';
    const tenantCNPJ = process.env.DEFAULT_TENANT_CNPJ || '04.038.227/0001-87';
    const tenantEmail = process.env.DEFAULT_TENANT_EMAIL || 'brito@updata.com.br';
    const tenantPhone = process.env.DEFAULT_TENANT_PHONE || '92991424261';
    const tenantDomain = process.env.DEFAULT_TENANT_DOMAIN || 'updata.com.br';
    const agentUrl = process.env.DEFAULT_AGENT_URL || 'https://provedor.updata.com.br/admin/addons/mk-edge/api.php';
    const agentToken = process.env.DEFAULT_AGENT_TOKEN || '34231c4733cb2c3d526490e5a1778835d7c30e3a88f1812528bedb353197be15';

    const tenantData = {
      _id: new mongoose.Types.ObjectId(tenantId),
      provedor: {
        nome: tenantName,
        razao_social: `${tenantName} LTDA`,
        cnpj: tenantCNPJ,
        dominio: tenantDomain,
        email: tenantEmail,
        telefone: tenantPhone
      },
      agente: {
        url: agentUrl,
        token: agentToken,
        ativo: true,
        config: {
          timeout: 15000,
          retry: true,
          max_retries: 2
        }
      },
      assinatura: {
        ativa: true,
        plano: 'enterprise',
        data_inicio: new Date(),
        data_fim: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // +1 ano
        valor_mensal: 1000
      },
      sistema: {
        tipo: 'mk-auth',
        versao: '2.0.0'
      },
      criado_em: new Date(),
      atualizado_em: new Date()
    };

    // Verifica se tenant já existe
    let tenant = await Tenant.findById(tenantId);
    if (tenant) {
      console.log('⚠️  Tenant já existe. Atualizando...');
      tenant = await Tenant.findByIdAndUpdate(tenantId, tenantData, { new: true });
    } else {
      tenant = await Tenant.create(tenantData);
    }

    console.log('✅ Tenant criado/atualizado com sucesso!\n');

    // ==================== CRIAR USUÁRIO ADMIN ====================

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 CRIANDO USUÁRIO ADMIN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const adminLogin = process.env.DEFAULT_ADMIN_LOGIN || 'admin';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@updata.com.br';

    const adminData = {
      login: adminLogin,
      email: adminEmail,
      senha: adminPassword,
      nome: 'Administrador',
      tenant_id: new mongoose.Types.ObjectId(tenantId),
      roles: ['admin'],
      permissoes: ['*:*'],
      ativo: true
    };

    // Verifica se usuário já existe
    let user = await User.findOne({ login: adminLogin, tenant_id: tenantId });

    if (user) {
      console.log('⚠️  Usuário admin já existe. Atualizando...');
      user.email = adminEmail;
      user.senha = adminPassword; // Será hashado no pre-save
      await user.save();
    } else {
      user = await User.create(adminData);
    }

    console.log('✅ Usuário admin criado/atualizado com sucesso!\n');

    // ==================== RESUMO ====================

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 INICIALIZAÇÃO CONCLUÍDA!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 TENANT CONFIGURADO:\n');
    console.log(`  Nome: ${tenant.provedor.nome}`);
    console.log(`  Domínio: ${tenant.provedor.dominio}`);
    console.log(`  Email: ${tenant.provedor.email}`);
    console.log(`  Telefone: ${tenant.provedor.telefone}`);
    console.log(`  ID: ${tenant._id}\n`);

    console.log('👤 ACESSO ADMIN:\n');
    console.log(`  Login: ${user.login}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Senha: ${adminPassword}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Sistema pronto para deploy!\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Erro na inicialização:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  MongoDB não está acessível!');
      console.error('   Aguarde o serviço MongoDB iniciar...');
    }
    console.error(error.stack);
    process.exit(1);
  }
}

// Aguarda conexão com MongoDB (útil em Docker)
const waitForMongo = async (maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await mongoose.connect(MONGODB_URL, { serverSelectionTimeoutMS: 3000 });
      await mongoose.disconnect();
      return true;
    } catch (error) {
      console.log(`⏳ Aguardando MongoDB... (${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('MongoDB não ficou disponível em tempo hábil');
};

// Executa se chamado diretamente
if (require.main === module) {
  waitForMongo()
    .then(() => initializeDefaultTenant())
    .catch(error => {
      console.error('Erro fatal:', error.message);
      process.exit(1);
    });
}

module.exports = { initializeDefaultTenant };
