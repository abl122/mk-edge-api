/**
 * PlanController.js
 * Gerencia planos de assinatura para tenants
 */

const logger = require('../../logger');

class PlanController {
    /**
     * Lista planos do tenant
     * GET /api/plans
     */
    async list(req, res) {
        try {
            const Plan = require('../schemas/Plan');
            const { active_only = 'false' } = req.query;
            
            // Buscar tenant_id do header ou query
            const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || req.user?.tenantId;

            const query = {};
            if (tenantId) {
                query.tenant_id = tenantId;
            }
            
            if (active_only === 'true') {
                query.ativo = true;
            }

            const plans = await Plan.find(query).sort({ ordem: 1, ativo: -1 }).lean();

            return res.json({
                success: true,
                plans,
                total: plans.length
            });
        } catch (error) {
            logger.error('Erro ao listar planos:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao listar planos'
            });
        }
    }

    /**
     * Obtém um plano específico
     * GET /api/plans/:planId
     */
    async show(req, res) {
        try {
            const { tenant } = req;
            const { planId } = req.params;

            const plan = tenant.plans?.find(p => p._id?.toString() === planId);

            if (!plan) {
                return res.status(404).json({
                    success: false,
                    message: 'Plano não encontrado'
                });
            }

            return res.json({
                success: true,
                plan
            });
        } catch (error) {
            logger.error('Erro ao obter plano:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao obter plano'
            });
        }
    }

    /**
     * Cria novo plano
     * POST /api/plans
     */
    async create(req, res) {
        try {
            const { tenant } = req;
            const {
                nome,
                slug,
                descricao,
                valor,
                periodo = 'mensal',
                recorrente = true,
                limite_clientes,
                recursos = [],
                destaque = false,
                cor = '#6366f1',
                dias_trial = 7
            } = req.body;

            const TenantService = require('../services/TenantService');

            // Validar slug único
            const existing = tenant.plans?.find(p => p.slug === slug);
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'Slug já existe para este tenant'
                });
            }

            const newPlan = {
                _id: require('mongoose').Types.ObjectId(),
                nome,
                slug,
                descricao,
                valor: parseFloat(valor),
                periodo,
                recorrente,
                limite_clientes: limite_clientes ? parseInt(limite_clientes) : null,
                recursos: Array.isArray(recursos) ? recursos : [],
                destaque,
                cor,
                dias_trial: parseInt(dias_trial),
                ativo: true,
                ordem: (tenant.plans?.length || 0) + 1,
                criado_em: new Date()
            };

            if (!tenant.plans) tenant.plans = [];
            tenant.plans.push(newPlan);

            await TenantService.updateTenant(tenant._id, { plans: tenant.plans });

            logger.info(`Plano criado: ${nome}`, { tenant: tenant.nome });

            return res.json({
                success: true,
                message: 'Plano criado com sucesso',
                plan: newPlan
            });
        } catch (error) {
            logger.error('Erro ao criar plano:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao criar plano',
                error: error.message
            });
        }
    }

    /**
     * Atualiza um plano
     * PUT /api/plans/:planId
     */
    async update(req, res) {
        try {
            const { tenant } = req;
            const { planId } = req.params;
            const {
                nome,
                descricao,
                valor,
                periodo,
                limite_clientes,
                recursos = [],
                destaque,
                cor,
                dias_trial,
                ativo
            } = req.body;

            const TenantService = require('../services/TenantService');

            const planIndex = tenant.plans?.findIndex(p => p._id?.toString() === planId);
            if (planIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Plano não encontrado'
                });
            }

            const plan = tenant.plans[planIndex];

            // Atualizar campos
            if (nome) plan.nome = nome;
            if (descricao) plan.descricao = descricao;
            if (valor) plan.valor = parseFloat(valor);
            if (periodo) plan.periodo = periodo;
            if (limite_clientes !== undefined) plan.limite_clientes = limite_clientes ? parseInt(limite_clientes) : null;
            if (recursos.length > 0) plan.recursos = recursos;
            if (destaque !== undefined) plan.destaque = destaque;
            if (cor) plan.cor = cor;
            if (dias_trial !== undefined) plan.dias_trial = parseInt(dias_trial);
            if (ativo !== undefined) plan.ativo = ativo;

            plan.atualizado_em = new Date();

            tenant.plans[planIndex] = plan;

            await TenantService.updateTenant(tenant._id, { plans: tenant.plans });

            logger.info(`Plano atualizado: ${plan.nome}`, { tenant: tenant.nome });

            return res.json({
                success: true,
                message: 'Plano atualizado com sucesso',
                plan
            });
        } catch (error) {
            logger.error('Erro ao atualizar plano:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao atualizar plano'
            });
        }
    }

    /**
     * Deleta um plano
     * DELETE /api/plans/:planId
     */
    async delete(req, res) {
        try {
            const { tenant } = req;
            const { planId } = req.params;

            const TenantService = require('../services/TenantService');

            const planIndex = tenant.plans?.findIndex(p => p._id?.toString() === planId);
            if (planIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Plano não encontrado'
                });
            }

            const deletedPlan = tenant.plans[planIndex];
            tenant.plans.splice(planIndex, 1);

            await TenantService.updateTenant(tenant._id, { plans: tenant.plans });

            logger.info(`Plano deletado: ${deletedPlan.nome}`, { tenant: tenant.nome });

            return res.json({
                success: true,
                message: 'Plano deletado com sucesso'
            });
        } catch (error) {
            logger.error('Erro ao deletar plano:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao deletar plano'
            });
        }
    }

    /**
     * Alterna status do plano (ativo/inativo)
     * PATCH /api/plans/:planId/toggle
     */
    async toggle(req, res) {
        try {
            const { tenant } = req;
            const { planId } = req.params;

            const TenantService = require('../services/TenantService');

            const plan = tenant.plans?.find(p => p._id?.toString() === planId);
            if (!plan) {
                return res.status(404).json({
                    success: false,
                    message: 'Plano não encontrado'
                });
            }

            plan.ativo = !plan.ativo;
            plan.atualizado_em = new Date();

            await TenantService.updateTenant(tenant._id, { plans: tenant.plans });

            return res.json({
                success: true,
                message: plan.ativo ? 'Plano ativado' : 'Plano desativado',
                plan
            });
        } catch (error) {
            logger.error('Erro ao alternar status do plano:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao alternar status'
            });
        }
    }

    /**
     * Retorna planos públicos (para o site)
     * GET /api/public/plans?dominio=example.com.br
     */
    async publicPlans(req, res) {
        try {
            const { tenant } = req;

            // Filtrar apenas planos ativos
            const activePlans = (tenant.plans || [])
                .filter(p => p.ativo === true)
                .map(p => ({
                    _id: p._id,
                    nome: p.nome,
                    slug: p.slug,
                    descricao: p.descricao,
                    valor: p.valor,
                    periodo: p.periodo,
                    recorrente: p.recorrente,
                    limite_clientes: p.limite_clientes,
                    recursos: p.recursos,
                    destaque: p.destaque,
                    cor: p.cor,
                    dias_trial: p.dias_trial
                }))
                .sort((a, b) => {
                    if (a.destaque && !b.destaque) return -1;
                    if (!a.destaque && b.destaque) return 1;
                    return a.ordem - b.ordem;
                });

            return res.json({
                success: true,
                plans: activePlans,
                total: activePlans.length,
                tenant_name: tenant.nome,
                tenant_color_primary: tenant.color_primary,
                tenant_color_secondary: tenant.color_secondary
            });
        } catch (error) {
            logger.error('Erro ao obter planos públicos:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao obter planos'
            });
        }
    }
}

module.exports = new PlanController();
