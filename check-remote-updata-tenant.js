#!/usr/bin/env node

/**
 * Script para verificar tenant_id de Updata Telecom no servidor REMOTO
 * 
 * Execução local (com conexão SSH/VPN ao servidor remoto):
 *   node check-remote-updata-tenant.js
 * 
 * Execução no servidor remoto via SSH:
 *   ssh root@IP_SERVIDOR
 *   cd /path/to/mk-edge-api
 *   node check-remote-updata-tenant.js
 * 
 * Variáveis de ambiente necessárias:
 *   MONGODB_REMOTE_URI - string de conexão MongoDB remoto
 *   Ex: mongodb://usuario:senha@172.31.255.2:27017/mkedgetenants
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_REMOTE_URI = process.env.MONGODB_REMOTE_URI || 'mongodb://172.26.0.2:27017/mkedgetenants';

async function checkRemoteUpdataTenant() {
  let connection = null;
  try {
    console.log('🔍 Conectando ao MongoDB REMOTO...');
    console.log(`   URI: ${MONGODB_REMOTE_URI.replace(/\/\/.*@/, '//***@')}\n`);

    connection = await mongoose.createConnection(MONGODB_REMOTE_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).asConnected();

    console.log('✅ Conectado com sucesso!\n');

    // Carregar modelo
    require('./src/app/schemas/Tenant');
    const Tenant = connection.model('Tenant');

    // Buscar Updata Telecom
    const updata = await Tenant.findOne({ 'provedor.nome': /updata/i }).lean();

    if (!updata) {
      console.log('❌ Tenant Updata Telecom NÃO ENCONTRADO no servidor remoto');
      process.exit(1);
    }

    console.log('✅ Tenant Updata Telecom ENCONTRADO!\n');
    console.log('━'.repeat(60));
    console.log('📋 INFORMAÇÕES DO TENANT\n');
    console.log(`🆔 Tenant ID:        ${updata._id}`);
    console.log(`🏢 Provedor:         ${updata.provedor?.nome || 'N/A'}`);
    console.log(`📋 Razão Social:     ${updata.provedor?.razao_social || 'N/A'}`);
    console.log(`🔢 CNPJ:             ${updata.provedor?.cnpj || 'N/A'}`);
    console.log(`🌐 Domínio:          ${updata.provedor?.dominio || 'N/A'}`);
    console.log(`📧 Email:            ${updata.provedor?.email || 'N/A'}`);
    console.log(`📞 Telefone:         ${updata.provedor?.telefone || 'N/A'}`);
    console.log(`👤 Admin Name:       ${updata.provedor?.admin_name || 'N/A'}`);
    console.log(`✔️  Ativo:            ${updata.provedor?.ativo ? 'SIM' : 'NÃO'}`);

    console.log('\n📦 ASSINATURA\n');
    console.log(`✔️  Ativa:            ${updata.assinatura?.ativa ? 'SIM' : 'NÃO'}`);
    console.log(`💳 Plano:            ${updata.assinatura?.plano || 'N/A'}`);
    console.log(`📝 Nome do Plano:    ${updata.assinatura?.plano_nome || 'N/A'}`);
    console.log(`📅 Data Início:      ${updata.assinatura?.data_inicio ? new Date(updata.assinatura.data_inicio).toLocaleDateString('pt-BR') : 'N/A'}`);
    console.log(`📅 Data Fim:         ${updata.assinatura?.data_fim ? new Date(updata.assinatura.data_fim).toLocaleDateString('pt-BR') : 'N/A'}`);
    console.log(`💰 Valor Mensal:     R$ ${updata.assinatura?.valor_mensal?.toFixed(2) || 'N/A'}`);
    console.log(`⏰ Status:           ${updata.assinatura?.status || 'N/A'}`);

    if (updata.agente?.ativo) {
      console.log('\n🔗 AGENTE MK-AUTH\n');
      console.log(`✔️  Ativo:            SIM`);
      console.log(`🔗 URL:              ${updata.agente?.url || 'N/A'}`);
      console.log(`🔐 Token:            ${updata.agente?.token ? '***' + updata.agente.token.slice(-6) : 'N/A'}`);
      console.log(`📅 Último Ping:      ${updata.agente?.ultimo_ping ? new Date(updata.agente.ultimo_ping).toLocaleString('pt-BR') : 'Nunca'}`);
      console.log(`📦 Versão:           ${updata.agente?.versao || 'Desconhecida'}`);
    }

    if (updata.integracoes) {
      console.log('\n🔌 INTEGRAÇÕES\n');
      if (updata.integracoes.efi?.ativa) {
        console.log(`✔️  EFI:              ATIVA`);
        console.log(`   Client ID:       ${updata.integracoes.efi?.client_id ? '***' + updata.integracoes.efi.client_id.slice(-4) : 'N/A'}`);
      }
      if (updata.integracoes.zapi?.ativa) {
        console.log(`✔️  ZAPI:             ATIVA`);
        console.log(`   Instance:        ${updata.integracoes.zapi?.instance || 'N/A'}`);
        console.log(`   Phone:           ${updata.integracoes.zapi?.phone || 'N/A'}`);
      }
    }

    console.log('\n' + '━'.repeat(60));
    console.log(`\n✅ Verificação concluída em ${new Date().toLocaleString('pt-BR')}\n`);

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Não foi possível conectar. Verifique:');
      console.error('   - A variável MONGODB_REMOTE_URI está correta');
      console.error('   - O servidor MongoDB está rodando');
      console.error('   - Você tem acesso de rede ao servidor');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.close();
      console.log('🔌 Conexão fechada');
    }
  }
}

checkRemoteUpdataTenant();
