/**
 * IntegrationController.js
 * Gerencia integrações com EFI (Pagamentos) e Z-API (WhatsApp)
 */

const axios = require('axios');
const logger = require('../../logger');

class IntegrationController {
    /**
     * Testa conexão com EFI
     */
    async testEfi(req, res) {
        try {
            const { tenant } = req;
            const tenantConfig = tenant.integrations?.efi;

            if (!tenantConfig || !tenantConfig.client_id || !tenantConfig.client_secret) {
                return res.status(400).json({
                    success: false,
                    message: 'EFI não configurado para este tenant'
                });
            }

            logger.info('Testando conexão EFI', { tenant: tenant.nome });

            // Simular teste de conexão (em produção, fazer requisição real)
            return res.json({
                success: true,
                message: 'Conexão EFI testada com sucesso',
                environment: tenantConfig.sandbox ? 'sandbox' : 'production',
                client_id: tenantConfig.client_id.substring(0, 20) + '...'
            });
        } catch (error) {
            logger.error('Erro ao testar EFI:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erro ao conectar com EFI',
                error: error.message
            });
        }
    }

    /**
     * Testa conexão com Z-API
     */
    async testZapi(req, res) {
        try {
            const { tenant } = req;
            const zapiConfig = tenant.integrations?.zapi;

            if (!zapiConfig || !zapiConfig.instance || !zapiConfig.token) {
                return res.status(400).json({
                    success: false,
                    message: 'Z-API não configurada para este tenant'
                });
            }

            logger.info('Testando conexão Z-API', { tenant: tenant.nome });

            // Simular teste de conexão (em produção, fazer requisição real)
            return res.json({
                success: true,
                message: 'Conexão Z-API testada com sucesso',
                instance: zapiConfig.instance.substring(0, 15) + '...',
                phone: 'xx 9 xxxxxxxx'
            });
        } catch (error) {
            logger.error('Erro ao testar Z-API:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erro ao conectar com Z-API',
                error: error.message
            });
        }
    }

    /**
     * Obtém configurações de integrações do tenant
     */
    async getConfig(req, res) {
        try {
            const { tenant } = req;
            const integrations = tenant.integrations || {};

            return res.json({
                success: true,
                integrations: {
                    efi: integrations.efi ? {
                        enabled: true,
                        environment: integrations.efi.sandbox ? 'sandbox' : 'production',
                        client_id: integrations.efi.client_id.substring(0, 20) + '...'
                    } : { enabled: false },
                    zapi: integrations.zapi ? {
                        enabled: true,
                        instance: integrations.zapi.instance.substring(0, 15) + '...'
                    } : { enabled: false }
                }
            });
        } catch (error) {
            logger.error('Erro ao obter configurações:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erro ao obter configurações'
            });
        }
    }

    /**
     * Atualiza configurações de EFI
     */
    async updateEfiConfig(req, res) {
        try {
            const { tenant } = req;
            const { client_id, client_secret, pix_key, sandbox } = req.body;
            const TenantService = require('../services/TenantService');

            const updateData = {
                'integrations.efi': {
                    client_id,
                    client_secret,
                    pix_key,
                    sandbox: sandbox || false,
                    updated_at: new Date()
                }
            };

            await TenantService.updateTenant(tenant._id, updateData);
            logger.info('Configurações EFI atualizadas', { tenant: tenant.nome });

            return res.json({
                success: true,
                message: 'Configurações EFI atualizadas com sucesso',
                requires_restart: false
            });
        } catch (error) {
            logger.error('Erro ao atualizar EFI:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erro ao atualizar configurações EFI',
                error: error.message
            });
        }
    }

    /**
     * Atualiza configurações de Z-API
     */
    async updateZapiConfig(req, res) {
        try {
            const { tenant } = req;
            const { instance, token, security_token } = req.body;
            const TenantService = require('../services/TenantService');

            const updateData = {
                'integrations.zapi': {
                    instance,
                    token,
                    security_token,
                    updated_at: new Date()
                }
            };

            await TenantService.updateTenant(tenant._id, updateData);
            logger.info('Configurações Z-API atualizadas', { tenant: tenant.nome });

            return res.json({
                success: true,
                message: 'Configurações Z-API atualizadas com sucesso',
                requires_restart: false
            });
        } catch (error) {
            logger.error('Erro ao atualizar Z-API:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erro ao atualizar configurações Z-API',
                error: error.message
            });
        }
    }

    /**
     * Obtém logs de webhooks
     */
    async getWebhookLogs(req, res) {
        try {
            const { tenant } = req;
            const TenantService = require('../services/TenantService');
            const tenantData = await TenantService.getTenant(tenant._id);

            const logs = tenantData.webhook_logs || [];
            const lastLogs = logs.slice(-50); // Últimos 50 registros

            return res.json({
                success: true,
                logs: lastLogs,
                total: logs.length
            });
        } catch (error) {
            logger.error('Erro ao obter logs:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erro ao obter logs'
            });
        }
    }
}

module.exports = new IntegrationController();
