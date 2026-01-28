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

            const Plan = require('mongoose').model('Plan');
            const plan = await Plan.findOne({ _id: planId, tenant_id: tenant._id });

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
                valor_mensal,
                periodo = 'mensal',
                recorrente = true,
                limite_clientes = 0,
                recursos = [],
                destaque = false,
                cor = '#6366f1',
                dias_trial = 0
            } = req.body;

            const Plan = require('mongoose').model('Plan');

            // Validar slug único
            const existing = await Plan.findOne({ tenant_id: tenant._id, slug });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'Slug já existe para este tenant'
                });
            }

            const newPlan = await Plan.create({
                tenant_id: tenant._id,
                nome,
                slug,
                descricao,
                valor_mensal: parseFloat(valor_mensal),
                periodo,
                recorrente,
                limite_clientes: parseInt(limite_clientes),
                recursos: Array.isArray(recursos) ? recursos : [],
                destaque,
                cor,
                dias_trial: parseInt(dias_trial),
                ativo: true
            });

            logger.info(`Plano criado: ${nome}`, { tenant: tenant.provedor.nome });

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
                valor_mensal,
                periodo,
                limite_clientes,
                recursos = [],
                destaque,
                cor,
                dias_trial,
                ativo
            } = req.body;

            const Plan = require('mongoose').model('Plan');

            // Buscar plano
            const plan = await Plan.findOne({ _id: planId, tenant_id: tenant._id });
            
            if (!plan) {
                return res.status(404).json({
                    success: false,
                    message: 'Plano não encontrado'
                });
            }

            // Atualizar campos
            if (nome !== undefined) plan.nome = nome;
            if (descricao !== undefined) plan.descricao = descricao;
            if (valor_mensal !== undefined) plan.valor_mensal = parseFloat(valor_mensal);
            if (periodo !== undefined) plan.periodo = periodo;
            if (limite_clientes !== undefined) plan.limite_clientes = limite_clientes ? parseInt(limite_clientes) : 0;
            if (recursos && recursos.length > 0) plan.recursos = recursos;
            if (destaque !== undefined) plan.destaque = destaque;
            if (cor !== undefined) plan.cor = cor;
            if (dias_trial !== undefined) plan.dias_trial = parseInt(dias_trial);
            if (ativo !== undefined) plan.ativo = ativo;

            plan.atualizado_em = new Date();

            await plan.save();

            logger.info(`Plano atualizado: ${plan.nome}`, { tenant: tenant.provedor.nome });

            return res.json({
                success: true,
                message: 'Plano atualizado com sucesso',
                plan
            });
        } catch (error) {
            logger.error('Erro ao atualizar plano:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao atualizar plano',
                error: error.message
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

            const Plan = require('mongoose').model('Plan');

            const plan = await Plan.findOne({ _id: planId, tenant_id: tenant._id });
            if (!plan) {
                return res.status(404).json({
                    success: false,
                    message: 'Plano não encontrado'
                });
            }

            await Plan.deleteOne({ _id: planId });

            logger.info(`Plano deletado: ${plan.nome}`, { tenant: tenant.provedor.nome });

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

            const Plan = require('mongoose').model('Plan');

            const plan = await Plan.findOne({ _id: planId, tenant_id: tenant._id });
            if (!plan) {
                return res.status(404).json({
                    success: false,
                    message: 'Plano não encontrado'
                });
            }

            plan.ativo = !plan.ativo;
            plan.atualizado_em = new Date();
            await plan.save();

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
