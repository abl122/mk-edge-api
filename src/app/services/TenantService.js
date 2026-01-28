const mongoose = require('mongoose');
const logger = require('../../logger');

/**
 * Tenant Service
 * 
 * Operações CRUD de tenants no MongoDB
 * Gerencia múltiplos provedores (tenants)
 */
class TenantService {
  /**
   * Encontra tenant por ID
   * @param {string} tenantId - ID do tenant
   * @returns {Promise<Object>} Documento do tenant
   */
  static async findById(tenantId) {
    try {
      // Valida se é um ObjectId válido
      if (!mongoose.Types.ObjectId.isValid(tenantId)) {
        logger.warn('Tenant ID inválido', { tenant_id: tenantId });
        return null;
      }

      const Tenant = mongoose.model('Tenant');
      const tenant = await Tenant.findById(tenantId);

      if (!tenant) {
        logger.debug('Tenant não encontrado', { tenant_id: tenantId });
        return null;
      }

      return tenant;

    } catch (error) {
      logger.error('Erro ao buscar tenant por ID', {
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Encontra tenant por CNPJ
   * @param {string} cnpj - CNPJ do provedor
   * @returns {Promise<Object>} Documento do tenant
   */
  static async findByCnpj(cnpj) {
    try {
      const Tenant = mongoose.model('Tenant');
      const tenant = await Tenant.findOne({ 'provedor.cnpj': cnpj });

      if (!tenant) {
        logger.debug('Tenant não encontrado por CNPJ', { cnpj });
        return null;
      }

      return tenant;

    } catch (error) {
      logger.error('Erro ao buscar tenant por CNPJ', {
        cnpj,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Encontra tenant por domínio
   * @param {string} dominio - Domínio do provedor
   * @returns {Promise<Object>} Documento do tenant
   */
  static async findByDomain(dominio) {
    try {
      const Tenant = mongoose.model('Tenant');
      const tenant = await Tenant.findOne({ 'provedor.dominio': dominio });

      if (!tenant) {
        logger.debug('Tenant não encontrado por domínio', { dominio });
        return null;
      }

      return tenant;

    } catch (error) {
      logger.error('Erro ao buscar tenant por domínio', {
        dominio,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Lista todos os tenants com paginação
   * @param {number} page - Página (começa em 1)
   * @param {number} limit - Itens por página
   * @param {Object} filters - Filtros adicionais
   * @returns {Promise<Object>} { tenants, total, pages }
   */
  static async findAll(page = 1, limit = 10, filters = {}) {
    try {
      const Tenant = mongoose.model('Tenant');
      
      // Monta query com filtros
      const query = {};
      if (filters.ativo !== undefined) {
        query['assinatura.ativa'] = filters.ativo;
      }
      if (filters.nome) {
        query['provedor.nome'] = { $regex: filters.nome, $options: 'i' };
      }
      if (filters.agenteAtivo !== undefined) {
        query['agente.ativo'] = filters.agenteAtivo;
      }

      const total = await Tenant.countDocuments(query);
      const skip = (page - 1) * limit;

      const tenants = await Tenant.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ criado_em: -1 });

      return {
        tenants,
        total,
        pages: Math.ceil(total / limit),
        page,
        limit
      };

    } catch (error) {
      logger.error('Erro ao listar tenants', { error: error.message });
      throw error;
    }
  }

  /**
   * Cria um novo tenant
   * @param {Object} data - Dados do tenant
   * @returns {Promise<Object>} Documento do tenant criado
   */
  static async create(data) {
    try {
      const Tenant = mongoose.model('Tenant');
      const crypto = require('crypto');

      // Valida campos obrigatórios
      if (!data.provedor?.nome || !data.provedor?.cnpj) {
        throw new Error('Nome e CNPJ do provedor são obrigatórios');
      }

      // Verifica se CNPJ já existe
      const existing = await this.findByCnpj(data.provedor.cnpj);
      if (existing) {
        throw new Error('Já existe um tenant com este CNPJ');
      }

      // Gera token do agente se não foi fornecido
      if (!data.agente) {
        data.agente = {};
      }
      if (!data.agente.token) {
        data.agente.token = crypto.randomBytes(32).toString('hex');
      }

      logger.debug('Criando tenant com dados:', {
        plano_atual: data.plano_atual,
        provedor_nome: data.provedor?.nome,
        provedor_ativo: data.provedor?.ativo,
        agente_url: data.agente?.url,
        has_assinatura: !!data.assinatura
      });

      const tenant = new Tenant({
        ...data,
        criado_em: new Date(),
        atualizado_em: new Date()
      });

      await tenant.save();

      logger.info('Tenant salvo no MongoDB:', {
        tenant_id: tenant._id,
        plano_atual: tenant.plano_atual,
        provedor_ativo: tenant.provedor?.ativo,
        assinatura_plano: tenant.assinatura?.plano
      });

      logger.info('Tenant criado com sucesso', {
        tenant_id: tenant._id,
        nome: tenant.provedor?.nome,
        cnpj: tenant.provedor?.cnpj
      });

      return tenant;

    } catch (error) {
      logger.error('Erro ao criar tenant', { error: error.message });
      throw error;
    }
  }

  /**
   * Atualiza um tenant existente
   * @param {string} tenantId - ID do tenant
   * @param {Object} data - Dados para atualizar
   * @returns {Promise<Object>} Documento do tenant atualizado
   */
  static async update(tenantId, data) {
    try {
      if (!mongoose.Types.ObjectId.isValid(tenantId)) {
        throw new Error('ID do tenant inválido');
      }

      const Tenant = mongoose.model('Tenant');
      const Plan = mongoose.model('Plan');
      const crypto = require('crypto');

      // Se está atualizando o plano da assinatura, buscar o valor real do plano
      if (data.assinatura?.plano) {
        const plan = await Plan.findOne({ slug: data.assinatura.plano });
        if (plan) {
          // Atualizar valor_mensal e plano_nome com os valores reais do plano
          data.assinatura.valor_mensal = plan.valor_mensal;
          data.assinatura.plano_nome = plan.nome;
          logger.info('📊 Sincronizando dados do plano', {
            plano: plan.slug,
            nome: plan.nome,
            valor_mensal: plan.valor_mensal
          });
        }
      }

      // Se está atualizando CNPJ, verifica se já existe
      if (data.provedor?.cnpj) {
        const existing = await Tenant.findOne({
          'provedor.cnpj': data.provedor.cnpj,
          _id: { $ne: tenantId }
        });

        if (existing) {
          throw new Error('Já existe um tenant com este CNPJ');
        }
      }

      // Gera token do agente se não foi fornecido e agente existe
      if (data.agente && !data.agente.token) {
        data.agente.token = crypto.randomBytes(32).toString('hex');
      }

      data.atualizado_em = new Date();

      // Log detalhado dos dados sendo atualizados
      logger.info('📝 Dados sendo salvos no tenant:', {
        tenant_id: tenantId,
        provedor_nome: data.provedor?.nome,
        provedor_admin_name: data.provedor?.admin_name,
        provedor_dominio: data.provedor?.dominio,
        plano_atual: data.plano_atual,
        assinatura_plano: data.assinatura?.plano,
        assinatura_valor_mensal: data.assinatura?.valor_mensal
      });

      const tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        data,
        { new: true, runValidators: true }
      );

      if (!tenant) {
        throw new Error('Tenant não encontrado');
      }

      // Se foi enviada uma nova senha, atualizar o usuário do portal
      if (data.senha_portal && data.senha_portal.trim()) {
        const User = mongoose.model('User');
        const bcrypt = require('bcryptjs');
        
        logger.info('🔐 Atualizando senha do usuário portal', {
          tenant_id: tenantId,
          tenant_cnpj: tenant.provedor?.cnpj
        });

        // Buscar usuário portal do tenant
        const portalUser = await User.findOne({
          tenant_id: tenantId,
          roles: 'portal'
        });

        if (portalUser) {
          // Atualizar senha existente
          const hashedPassword = await bcrypt.hash(data.senha_portal, 10);
          portalUser.senha = hashedPassword;
          await portalUser.save();
          
          logger.info('✅ Senha do usuário portal atualizada', {
            user_id: portalUser._id,
            login: portalUser.login
          });
        } else {
          // Criar usuário portal se não existir
          const hashedPassword = await bcrypt.hash(data.senha_portal, 10);
          const cnpj = tenant.provedor?.cnpj?.replace(/[^\d]/g, '');
          
          const newPortalUser = await User.create({
            tenant_id: tenantId,
            login: cnpj,
            senha: hashedPassword,
            nome: tenant.provedor?.nome || 'Portal',
            email: tenant.provedor?.email || '',
            roles: 'portal',
            ativo: true
          });
          
          logger.info('✅ Usuário portal criado', {
            user_id: newPortalUser._id,
            login: newPortalUser.login
          });
        }
      }

      logger.info('Tenant atualizado com sucesso', {
        tenant_id: tenantId,
        nome: tenant.provedor?.nome
      });

      return tenant;

    } catch (error) {
      logger.error('Erro ao atualizar tenant', {
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Deleta um tenant
   * @param {string} tenantId - ID do tenant
   * @returns {Promise<boolean>} true se deletado
   */
  static async delete(tenantId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(tenantId)) {
        throw new Error('ID do tenant inválido');
      }

      const Tenant = mongoose.model('Tenant');
      const result = await Tenant.findByIdAndDelete(tenantId);

      if (!result) {
        throw new Error('Tenant não encontrado');
      }

      logger.info('Tenant deletado com sucesso', {
        tenant_id: tenantId,
        nome: result.provedor?.nome
      });

      return true;

    } catch (error) {
      logger.error('Erro ao deletar tenant', {
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verifica se um agente está respondendo (ping)
   * @param {string} tenantId - ID do tenant
   * @returns {Promise<boolean>} true se agente responde
   */
  static async pingAgente(tenantId) {
    try {
      const tenant = await this.findById(tenantId);

      if (!tenant?.usaAgente?.()) {
        return false;
      }

      // Aqui você integraria com MkAuthAgentService para fazer um ping real
      // Por enquanto, apenas marca último ping
      tenant.agente.ultimo_ping = new Date();
      await tenant.save();

      logger.info('Agente verificado com sucesso', {
        tenant_id: tenantId,
        url: tenant.agente?.url
      });

      return true;

    } catch (error) {
      logger.error('Erro ao verificar agente', {
        tenant_id: tenantId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Atualiza configurações do agente
   * @param {string} tenantId - ID do tenant
   * @param {Object} config - Configurações do agente
   * @returns {Promise<Object>} Documento atualizado
   */
  static async updateAgente(tenantId, config) {
    try {
      if (!mongoose.Types.ObjectId.isValid(tenantId)) {
        throw new Error('ID do tenant inválido');
      }

      const Tenant = mongoose.model('Tenant');
      const tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        {
          agente: {
            ...config,
            atualizado_em: new Date()
          }
        },
        { new: true }
      );

      if (!tenant) {
        throw new Error('Tenant não encontrado');
      }

      logger.info('Configurações do agente atualizadas', {
        tenant_id: tenantId,
        agente_ativo: tenant.agente?.ativo
      });

      return tenant;

    } catch (error) {
      logger.error('Erro ao atualizar agente', {
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = TenantService;
