/**
 * RegisterController - Registro de Novos Tenants
 * POST /register - Público (sem autenticação)
 */

const TenantService = require('../services/TenantService');
const User = require('../schemas/User');
const bcrypt = require('bcryptjs');

class RegisterController {
  /**
   * Registrar novo tenant + admin user
   * POST /register
   */
  static async store(req, res) {
    try {
      const {
        nome,
        razao_social,
        cnpj,
        dominio,
        email,
        telefone,
        admin_name,
        admin_nome,
        admin_email,
        admin_telefone,
        senha,
        plan_slug
      } = req.body;

      // === VALIDAÇÕES ===

      // Campos obrigatórios
      if (!nome || !cnpj || !email || !admin_email || !senha || !plan_slug) {
        return res.status(400).json({
          success: false,
          message: 'Campos obrigatórios faltando: nome, cnpj, email, admin_email, senha, plan_slug'
        });
      }

      // Validar formato CNPJ (básico)
      const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/;
      if (!cnpjRegex.test(cnpj)) {
        return res.status(400).json({
          success: false,
          message: 'Formato de CNPJ inválido'
        });
      }

      // Normalizar CNPJ (remover pontuação)
      const cnpjNormalizado = cnpj.replace(/[^\d]/g, '');

      // Validar email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email) || !emailRegex.test(admin_email)) {
        return res.status(400).json({
          success: false,
          message: 'Email inválido'
        });
      }

      // Validar força da senha (min 8 chars, maiúscula, minúscula, número)
      const senhaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[\w@$!%*?&]{8,}$/;
      if (!senhaRegex.test(senha)) {
        return res.status(400).json({
          success: false,
          message: 'Senha deve ter mínimo 8 caracteres com maiúscula, minúscula e número'
        });
      }

      // === VERIFICAÇÕES DE DUPLICAÇÃO ===

      // Verificar se CNPJ já existe
      const tenantExistente = await TenantService.findByCnpj(cnpjNormalizado);
      if (tenantExistente) {
        return res.status(409).json({
          success: false,
          message: 'Já existe um tenant com este CNPJ'
        });
      }

      // Verificar se domínio já existe (se fornecido)
      if (dominio) {
        const tenantPorDominio = await TenantService.findByDomain(dominio);
        if (tenantPorDominio) {
          return res.status(409).json({
            success: false,
            message: 'Domínio já está em uso'
          });
        }
      }

      // Verificar se email já está em uso como usuário
      const usuarioExistente = await User.findOne({ 
        $or: [
          { login: admin_email },
          { email: admin_email }
        ]
      });
      if (usuarioExistente) {
        return res.status(409).json({
          success: false,
          message: 'Email já cadastrado no sistema'
        });
      }

      // === CRIAR TENANT ===

      const novoTenant = {
        provedor: {
          nome: nome,
          razao_social: razao_social || nome,
          cnpj: cnpjNormalizado,
          email: email,
          telefone: telefone,
          dominio: dominio || null,
          admin_name: admin_name || admin_nome,
          ativo: true
        },
        plano_atual: plan_slug, // Slug do plano selecionado
        assinatura: {
          plano: plan_slug, // Usa o plano escolhido
          ativa: true, // Ativa imediatamente
          data_inicio: new Date(),
          data_fim: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // +1 ano
        },
        agente: {
          url: process.env.AGENTE_URL || 'http://localhost:3001',
          token: require('crypto').randomBytes(32).toString('hex'),
          ativo: false
        },
        status: 'aguardando_pagamento',
        criado_em: new Date(),
        atualizado_em: new Date()
      };

      const tenant = await TenantService.create(novoTenant);

      // === CRIAR USUÁRIO ADMIN ===

      // Hash da senha
      const senhaHash = await bcrypt.hash(senha, 10);

      const novoUsuario = new User({
        nome: admin_nome,
        login: admin_email,
        email: admin_email,
        telefone: admin_telefone || '',
        senha: senhaHash,
        roles: ['admin'],
        tenant_id: tenant._id,
        status: 'ativo',
        criado_em: new Date(),
        atualizado_em: new Date()
      });

      await novoUsuario.save();

      // === CRIAR USUÁRIO PORTAL ===

      const usuarioPortal = new User({
        nome: nome,
        login: cnpjNormalizado,
        email: email,
        telefone: telefone || '',
        senha: senhaHash, // Mesma senha do admin inicialmente
        roles: ['portal'],
        tenant_id: tenant._id,
        ativo: true,
        criado_em: new Date(),
        atualizado_em: new Date()
      });

      await usuarioPortal.save();

      // === CRIAR SUBSCRIPTION ===

      let subscription = null;
      try {
        const Subscription = require('../schemas/Subscription');
        const Plan = require('../schemas/Plan');
        
        // Buscar informações do plano
        const plan = await Plan.findOne({ slug: plan_slug });
        
        if (!plan) {
          console.warn('Plano não encontrado:', plan_slug);
          throw new Error('Plano não encontrado');
        }
        
        const dataVencimento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 dias
        
        const novaSubscription = new Subscription({
          tenant_id: tenant._id,
          plan_slug: plan_slug,
          plan_name: plan.nome,
          valor_mensal: plan.valor_mensal || 0,
          status: 'ativa',
          data_inicio: new Date(),
          data_vencimento: dataVencimento,
          ciclo_cobranca: 'mensal',
          renovacao_automatica: true
        });

        subscription = await novaSubscription.save();
      } catch (err) {
        console.warn('Aviso: Subscription não foi criada:', err.message);
        // Continuar mesmo se Subscription falhar (modelo pode não existir)
      }

      // === RESPOSTA SUCESSO ===

      return res.status(201).json({
        success: true,
        message: 'Cadastro realizado com sucesso',
        user_id: novoUsuario._id.toString(),
        tenant_id: tenant._id.toString(),
        subscription_id: subscription ? subscription._id.toString() : null,
        data: {
          tenant: {
            id: tenant._id,
            nome: tenant.provedor.nome,
            cnpj: tenant.provedor.cnpj,
            email: tenant.provedor.email
          },
          admin: {
            id: novoUsuario._id,
            nome: novoUsuario.nome,
            email: novoUsuario.login,
            roles: novoUsuario.roles
          }
        }
      });

    } catch (error) {
      console.error('❌ Erro ao registrar:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Erro ao realizar cadastro',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = RegisterController;
