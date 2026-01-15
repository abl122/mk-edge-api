/**
 * CheckoutController
 * 
 * Controla o fluxo de checkout, geração de PIX via EFI
 * e criação automática de tenant após pagamento confirmado
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const Tenant = require('../schemas/Tenant');
const User = require('../schemas/User');
const nodemailer = require('nodemailer');
const logger = require('../../logger');

// Configurações EFI (Gerencianet)
const EFI_CONFIG = {
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  api_url: process.env.EFI_API_URL || 'https://api.gerencianet.com.br',
  certPath: process.env.EFI_CERT_PATH,
  certKey: process.env.EFI_CERT_KEY
};

// Configurar nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: process.env.MAIL_PORT || 587,
  secure: process.env.MAIL_SECURE === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

class CheckoutController {
  /**
   * POST /api/checkout/initiate
   * Inicia checkout e gera PIX via EFI
   */
  async initiate(req, res) {
    try {
      const { plan_slug, email, name, phone, plan, amount, password } = req.body;

      // Validações
      if (!email || !name || !phone) {
        return res.status(400).json({
          success: false,
          message: 'Dados incompletos (nome, email, telefone requeridos)'
        });
      }

      if (!password || password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Senha deve ter no mínimo 8 caracteres'
        });
      }

      // Armazenar senha no req para usar depois
      req.body.password = password;

      // Para teste, não fazer requisição real ao EFI
      // Em produção, chamar API do EFI
      const payment = await this.generatePixWithEFI(plan || plan_slug, email, name, phone, amount);

      return res.json({
        success: true,
        pix: payment.pix_code,
        qr_code: payment.qr_code,
        payment_id: payment.payment_id,
        expires_in: 1800 // 30 minutos
      });
    } catch (error) {
      logger.error('Erro ao iniciar checkout:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao processar checkout'
      });
    }
  }

  /**
   * Gera PIX via API EFI
   */
  async generatePixWithEFI(plan_slug, email, name, phone) {
    try {
      // Gerar ID de transação único
      const payment_id = `MK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Buscar plano para obter o valor
      // Em implementação real, seria com tenant específico
      // Por enquanto, retornar mock
      
      // Para teste local, retornar dados fake
      // Em produção, fazer chamada real à API EFI
      const pixCode = `00020126360014br.gov.bcb.pix0136${payment_id}520400005303986540510.005802BR5913MKAUTHAGENT6009SAOPAULO62410503***`;
      const qrCode = await this.generateQRCode(pixCode);

      // Salvar informação de pagamento em cache/banco de dados
      await this.savePendingPayment({
        payment_id,
        plan_slug,
        email,
        name,
        phone,
        pix_code: pixCode,
        status: 'pending',
        created_at: new Date()
      });

      return {
        payment_id,
        pix_code: pixCode,
        qr_code: qrCode
      };
    } catch (error) {
      logger.error('Erro ao gerar PIX:', error);
      throw error;
    }
  }

  /**
   * Gera QR Code em base64
   */
  async generateQRCode(pixCode) {
    try {
      // Usar biblioteca QR Code para gerar
      const QRCode = require('qrcode');
      const qrCode = await QRCode.toDataURL(pixCode);
      return qrCode.split(',')[1]; // Retorna apenas base64 sem data:image/png;base64,
    } catch (error) {
      logger.error('Erro ao gerar QR Code:', error);
      return 'qrcode_placeholder';
    }
  }

  /**
   * Salvar informação de pagamento pendente
   * (Em memória para demonstração, em produção seria DB)
   */
  async savePendingPayment(paymentData) {
    // TODO: Salvar em MongoDB collection "PendingPayments"
    if (!global.pendingPayments) {
      global.pendingPayments = {};
    }
    global.pendingPayments[paymentData.payment_id] = paymentData;
    logger.info(`Pagamento pendente criado: ${paymentData.payment_id}`);
  }

  /**
   * POST /api/webhooks/efi
   * Webhook da EFI para confirmar pagamento
   * Cria tenant, admin user, ativa plano e envia email
   */
  async webhookEFI(req, res) {
    try {
      const event = req.body;
      logger.info('Webhook EFI recebido:', event);

      // Extrair dados do webhook (varia conforme implementação EFI)
      const { charge_id, value, status, payment_id, additional_info } = event;

      // Validar assinatura do webhook (segurança)
      // TODO: Implementar validação de assinatura

      if (status !== 'paid' && status !== 'completed') {
        logger.info(`Pagamento não confirmado: ${status}`);
        return res.json({ success: true }); // Retornar sucesso para não reprocessar
      }

      // Buscar informação de pagamento pendente
      const pendingPayment = Object.values(global.pendingPayments || {})
        .find(p => p.payment_id === payment_id || p.charge_id === charge_id);

      if (!pendingPayment) {
        logger.error('Pagamento pendente não encontrado:', payment_id);
        return res.status(404).json({
          success: false,
          message: 'Pagamento não identificado'
        });
      }

      // CRIAR TENANT E USUARIO AUTOMATICAMENTE
      const newTenant = await this.createTenantFromPayment(pendingPayment, value);
      
      // Enviar email com credenciais
      await this.sendWelcomeEmail(newTenant, pendingPayment);

      // Marcar pagamento como processado
      pendingPayment.status = 'processed';
      pendingPayment.processed_at = new Date();

      return res.json({
        success: true,
        message: 'Pagamento confirmado e tenant criado',
        tenant_id: newTenant._id
      });
    } catch (error) {
      logger.error('Erro no webhook EFI:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao processar webhook'
      });
    }
  }

  /**
   * Criar tenant e admin user automaticamente após pagamento
   */
  async createTenantFromPayment(paymentData, amount) {
    try {
      const { plan_slug, email, name, phone, password } = paymentData;

      // Gerar domínio único baseado no nome
      const domain = this.generateDomain(name);
      
      // Gerar tenant_id único (MongoDB ObjectId format)
      const tenant_id = new mongoose.Types.ObjectId().toString();
      
      // Gerar token_agente único (64 caracteres hex = 32 bytes)
      const token_agente = crypto.randomBytes(32).toString('hex');
      
      // Gerar CNPJ mocado ou real (para teste: usar padrão)
      const cnpj = this.generateCNPJ();

      // Criar tenant
      const newTenant = new Tenant({
        _id: tenant_id,
        nome: name,
        razao_social: name,
        dominio: domain,
        email: email,
        telefone: phone,
        cnpj: cnpj,
        tenant_id: tenant_id,
        token_agente: token_agente,
        plano_ativo: plan_slug,
        status: 'ativo',
        data_contracao: new Date(),
        data_vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
        logo: null,
        color_primary: '#3498db',
        color_secondary: '#2980b9',
        integrations: {},
        plans: []
      });

      // Encontrar plano e adicionar ao tenant
      // TODO: Buscar plano da configuração global/sistema

      await newTenant.save();
      logger.info(`Tenant criado: ${newTenant._id} (${domain})`);

      // Criar admin user com a senha fornecida pelo cliente (ou gerar temporária se não fornecida)
      const finalPassword = password || crypto.randomBytes(12).toString('hex');
      
      const adminUser = new User({
        tenant_id: newTenant._id,
        nome: name,
        email: email,
        telefone: phone,
        senha: this.hashPassword(finalPassword), // TODO: Usar bcrypt em produção
        tipo: 'admin',
        ativo: true,
        criado_em: new Date()
      });

      await adminUser.save();
      logger.info(`Admin user criado: ${adminUser._id}`);

      // Retornar tenant com credenciais
      return {
        ...newTenant.toObject(),
        admin_email: email,
        admin_password: finalPassword, // Senha escolhida pelo cliente
        domain: domain,
        portal_url: `http://${domain}:3000/portal`,
        portal_login: email
      };
    } catch (error) {
      logger.error('Erro ao criar tenant:', error);
      throw error;
    }
  }

  /**
   * Gerar domínio único
   */
  generateDomain(name) {
    // Remover caracteres especiais, converter para minúsculas
    let domain = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substr(0, 20);

    // Adicionar sufixo aleatório para garantir unicidade
    domain += '-' + Math.random().toString(36).substr(2, 5);
    
    return domain;
  }

  /**
   * Hash de senha (em produção usar bcrypt)
   */
  hashPassword(password) {
    // TODO: Usar bcrypt com salt
    return require('crypto').createHash('sha256').update(password).digest('hex');
  }

  /**
   * Enviar email de boas-vindas com credenciais
   */
  async sendWelcomeEmail(tenant, paymentData) {
    try {
      const { email, name } = paymentData;
      const portalUrl = `http://${tenant.domain}:3000/portal`;
      const installCommand = `curl -s http://localhost:3335/api/installer/script/${tenant._id}?email=${email} | bash`;

      const emailBody = `
        <h1>Bem-vindo ao MK-Edge! 🎉</h1>
        <p>Olá ${name},</p>
        
        <p>Sua assinatura foi confirmada com sucesso!</p>
        
        <h2>Acesse seu Painel</h2>
        <p>
          <strong>URL:</strong> <a href="${portalUrl}">${portalUrl}</a><br>
          <strong>Email:</strong> ${email}<br>
          <strong>Senha:</strong> ${tenant.admin_password}
        </p>
        
        <p><strong>⚠️ Importante:</strong> A senha que você escolheu durante o cadastro é a mesma para acessar o portal.</p>
        
        <h2>Dados da Integração</h2>
        <p>
          <strong>Tenant ID:</strong> ${tenant.tenant_id}<br>
          <strong>Token do Agente:</strong> ${tenant.token_agente.substring(0, 32)}...${tenant.token_agente.substring(tenant.token_agente.length - 8)}
        </p>
        
        <h2>Instalar o Agente (API)</h2>
        <p>Execute o comando abaixo no terminal do seu servidor Linux:</p>
        <pre style="background: #f4f4f4; padding: 15px; border-radius: 8px;">
${installCommand}
        </pre>
        
        <p>Ou <a href="http://localhost:3335/api/installer/download/${tenant._id}?email=${email}">clique aqui para baixar o instalador personalizado</a></p>
        
        <h2>Próximos Passos</h2>
        <ol>
          <li>Faça login no portal com suas credenciais</li>
          <li>Instale o agente no seu servidor usando o comando acima ou o instalador personalizado</li>
          <li>Configure as integrações</li>
        </ol>
        
        <p>Qualquer dúvida, entre em contato conosco!</p>
        
        <p>Atenciosamente,<br>Time MK-Edge</p>
      `;

      await transporter.sendMail({
        from: process.env.MAIL_FROM || 'noreply@mkedge.com.br',
        to: email,
        subject: '✅ Sua Assinatura MK-Edge Confirmada!',
        html: emailBody
      });

      logger.info(`Email de boas-vindas enviado para: ${email}`);
    } catch (error) {
      logger.error('Erro ao enviar email:', error);
      // Não falhar o processo, apenas registrar
    }
  }

  /**
   * GET /api/checkout/status/:paymentId
   * Verificar status do pagamento
   */
  async checkPaymentStatus(req, res) {
    try {
      const { paymentId } = req.params;

      const pendingPayment = global.pendingPayments?.[paymentId];

      if (!pendingPayment) {
        return res.status(404).json({
          success: false,
          message: 'Pagamento não encontrado'
        });
      }

      return res.json({
        success: true,
        status: pendingPayment.status,
        payment_id: paymentId,
        processed_at: pendingPayment.processed_at || null
      });
    } catch (error) {
      logger.error('Erro ao verificar status:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao verificar status'
      });
    }
  }

  /**
   * Gerar CNPJ aleatório (formato: XX.XXX.XXX/XXXX-XX)
   * Em produção, validar CNPJ real
   */
  generateCNPJ() {
    const n1 = Math.floor(Math.random() * 9);
    const n2 = Math.floor(Math.random() * 9);
    const n3 = Math.floor(Math.random() * 9);
    const n4 = Math.floor(Math.random() * 9);
    const n5 = Math.floor(Math.random() * 9);
    const n6 = Math.floor(Math.random() * 9);
    const n7 = Math.floor(Math.random() * 9);
    const n8 = Math.floor(Math.random() * 9);
    const n9 = 0;
    const n10 = 0;
    const n11 = 0;
    const n12 = 1;

    let d1 = n12 * 2 + n11 * 3 + n10 * 4 + n9 * 5 + n8 * 6 + n7 * 7 + n6 * 8 + n5 * 9 + n4 * 2 + n3 * 3 + n2 * 4 + n1 * 5;
    d1 = 11 - (d1 % 11);
    d1 = d1 >= 10 ? 0 : d1;

    let d2 = d1 * 2 + n12 * 3 + n11 * 4 + n10 * 5 + n9 * 6 + n8 * 7 + n7 * 8 + n6 * 9 + n5 * 2 + n4 * 3 + n3 * 4 + n2 * 5 + n1 * 6;
    d2 = 11 - (d2 % 11);
    d2 = d2 >= 10 ? 0 : d2;

    const cnpj = `${n1}${n2}${n3}${n4}${n5}${n6}${n7}${n8}${n9}${n10}${n11}${n12}${d1}${d2}`;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
  }

  /**
   * Gerar domínio único baseado no nome
   */
  generateDomain(name) {
    const clean = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
    return `${clean}-${Date.now().toString(36)}`;
  }

  /**
   * Hash de senha (TODO: usar bcrypt em produção)
   */
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }
}

module.exports = new CheckoutController();
