const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./src/app/schemas/User');
const Tenant = require('./src/app/schemas/Tenant');
const logger = require('./src/logger');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/mkedgetenants';

async function createAdminUser() {
  try {
    await mongoose.connect(MONGODB_URL);
    logger.info('✅ MongoDB conectado');

    // Credenciais padrão
    const adminLogin = 'admin';
    const adminSenha = 'admin@12345'; // Deve ser alterada após primeiro login
    const adminNome = 'Administrador';
    const adminEmail = 'admin@mk-edge.com.br';

    // Verificar se já existe um admin
    const adminExistente = await User.findOne({ 
      login: adminLogin,
      roles: { $in: ['admin'] }
    });

    if (adminExistente) {
      logger.warn('⚠️  Admin já existe no banco de dados');
      logger.info('Login:', adminExistente.login);
      logger.info('Email:', adminExistente.email);
      process.exit(0);
    }

    // Buscar ou criar Tenant padrão para o admin
    let tenantAdmin = await Tenant.findOne({ 
      'provedor.nome': 'MK-EDGE Admin' 
    });

    if (!tenantAdmin) {
      tenantAdmin = await Tenant.create({
        provedor: {
          nome: 'MK-EDGE Admin',
          cnpj: '00.000.000/0000-00',
          email: adminEmail,
          dominio: 'mk-edge-admin'
        },
        assinatura: {
          plano: 'enterprise',
          ativa: true,
          data_inicio: new Date()
        },
        agente: {
          url: 'http://localhost:3001',
          token: require('crypto').randomBytes(32).toString('hex'),
          ativo: true
        },
        status: 'ativo'
      });
      logger.info('✅ Tenant admin criado');
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(adminSenha, 10);

    // Criar usuario admin
    const novoAdmin = new User({
      nome: adminNome,
      login: adminLogin,
      email: adminEmail,
      telefone: '(11) 9999-9999',
      senha: senhaHash,
      roles: ['admin'],
      tenant_id: tenantAdmin._id,
      ativo: true,
      bloqueado: false,
      criado_em: new Date()
    });

    await novoAdmin.save();

    logger.info('');
    logger.info('✅✅✅ ADMIN CRIADO COM SUCESSO ✅✅✅');
    logger.info('');
    logger.info('📋 CREDENCIAIS DE ACESSO:');
    logger.info('   Usuário: ' + adminLogin);
    logger.info('   Senha:   ' + adminSenha);
    logger.info('');
    logger.info('🔗 URL de Login: http://localhost:5173/admin/login');
    logger.info('');
    logger.info('⚠️  IMPORTANTE: Altere a senha após o primeiro login!');
    logger.info('');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Erro ao criar admin:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createAdminUser();
