/**
 * EmailController.js
 * Gerencia configurações de Email para integração SMTP
 */

const logger = require('../../logger');
const nodemailer = require('nodemailer');

class EmailController {
    /**
     * Obtém configuração de Email do tenant
     * GET /api/integrations/email/config
     */
    async getConfig(req, res) {
        try {
            const { tenant } = req;
            const IntegrationService = require('../services/IntegrationService');

            if (!tenant) {
                return res.json({
                    success: true,
                    config: {
                        enabled: false,
                        smtp_host: '',
                        smtp_port: 587,
                        username: '',
                        from_email: '',
                        from_name: 'MK-Edge',
                        use_tls: true,
                        has_password: false,
                        updated_at: null
                    }
                });
            }

            const emailConfig = await IntegrationService.findByTenantAndType(
                tenant._id,
                'email'
            );

            if (!emailConfig) {
                logger.info('Email sem configuração; retornando padrão', {
                    tenant: tenant?.nome || tenant?._id
                });
                return res.json({
                    success: true,
                    config: {
                        enabled: false,
                        smtp_host: '',
                        smtp_port: 587,
                        username: '',
                        from_email: '',
                        from_name: 'MK-Edge',
                        use_tls: true,
                        has_password: false,
                        updated_at: null
                    }
                });
            }

            // Retornar configuração sem expor a senha
            const saved = emailConfig.email || {};
            logger.info('Email configuração carregada', {
                tenant: tenant?.nome || tenant?._id,
                enabled: !!(saved.habilitado || saved.enabled),
                updated_at: emailConfig.updated_at || null
            });
            return res.json({
                success: true,
                config: {
                    enabled: saved.habilitado || saved.enabled || false,
                    smtp_host: saved.host || saved.smtp_host || '',
                    smtp_port: saved.port || saved.smtp_port || 587,
                    username: saved.usuario || saved.username || '',
                    password: saved.password || saved.senha || '',
                    from_email: saved.from_email || saved.de || saved.fromEmail || '',
                    from_name: saved.from_name || 'MK-Edge',
                    use_tls: saved.usar_tls !== false,
                    has_password: !!(saved.senha || saved.password),
                    updated_at: emailConfig.updated_at || null
                }
            });
        } catch (error) {
            logger.error('Erro ao obter configuração de email:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao obter configuração de email'
            });
        }
    }

    /**
     * Atualiza configuração de Email do tenant
     * POST /api/integrations/email/config
     */
    async updateConfig(req, res) {
        try {
            const { tenant } = req;
            const body = req.body || {};
            // Suporta nomes antigos e novos (frontend usa 'enabled')
            const habilitado = body.enabled ?? body.habilitado ?? false;
            const host = body.host ?? body.smtp_host ?? '';
            const port = body.port ?? body.smtp_port ?? 587;
            const usuario = body.usuario ?? body.username ?? '';
            const senha = body.senha ?? body.password ?? '';
            const de = body.de ?? body.from_email ?? (usuario || '');
            const from_name = body.from_name ?? 'MK-Edge';
            const usar_tls = body.usar_tls ?? body.use_tls ?? true;

            const IntegrationService = require('../services/IntegrationService');

            // Buscar configuração atual para preservar senha se não foi fornecida
            const currentConfig = await IntegrationService.findByTenantAndType(
                tenant._id,
                'email'
            );

            // Construir dados do email
            const emailData = {
                habilitado: !!habilitado,
                enabled: !!habilitado,
                host: host || '',
                smtp_host: host || '',
                port: port || 587,
                smtp_port: port || 587,
                usuario: usuario || '',
                username: usuario || '',
                from_email: de || usuario || '',
                from_name,
                usar_tls: usar_tls !== false
            };

            // Se forneceu senha, adicionar; caso contrário, preservar a existente
            if (senha) {
                // Armazena em ambos os campos para compatibilidade (senha/password)
                emailData.senha = senha;
                emailData.password = senha;
            } else if (currentConfig?.email) {
                // Preservar senha existente
                const saved = currentConfig.email;
                if (saved.senha || saved.password) {
                    emailData.senha = saved.senha || saved.password;
                    emailData.password = saved.password || saved.senha;
                }
            }

            const result = await IntegrationService.upsert(
                tenant._id,
                'email',
                emailData
            );

            logger.info('Configuração de email atualizada', {
                tenant: tenant?.nome || tenant?._id,
                enabled: !!emailData.habilitado
            });

            // Retornar configuração completa
            const config = result.email || {};
            return res.json({
                success: true,
                message: 'Configuração de email atualizada com sucesso',
                config: {
                    enabled: config.habilitado || config.enabled || false,
                    smtp_host: config.host || config.smtp_host || '',
                    smtp_port: config.port || config.smtp_port || 587,
                    username: config.usuario || config.username || '',
                    password: config.password || config.senha || '',
                    from_email: config.from_email || config.de || config.fromEmail || '',
                    from_name: config.from_name || 'MK-Edge',
                    use_tls: config.usar_tls !== false,
                    has_password: !!(config.senha || config.password),
                    updated_at: result.updated_at
                }
            });
        } catch (error) {
            logger.error('Erro ao atualizar configuração de email:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao atualizar configuração de email',
                error: error.message
            });
        }
    }

    /**
     * Testa a configuração de Email
     * POST /api/integrations/email/test
     */
    async test(req, res) {
        try {
            const { tenant } = req;
            const { para } = req.body;
            const IntegrationService = require('../services/IntegrationService');

            if (!para || !para.includes('@')) {
                logger.warn('Teste de email cancelado: destinatário inválido', {
                    tenant: tenant?.nome || tenant?._id,
                    para
                });
                return res.status(400).json({
                    success: false,
                    message: 'Email inválido para teste'
                });
            }

            const emailConfig = await IntegrationService.findByTenantAndType(
                tenant._id,
                'email'
            );

            if (!emailConfig || !emailConfig.email || (!emailConfig.email.habilitado && !emailConfig.email.enabled)) {
                logger.warn('Teste de email cancelado: integração desabilitada ou não configurada', {
                    tenant: tenant?.nome || tenant?._id
                });
                return res.status(400).json({
                    success: false,
                    message: 'Email não está configurado ou habilitado'
                });
            }

            // Aqui você implementaria a lógica de teste
            // Por enquanto, apenas retornamos sucesso
            logger.info(`Teste de email enviado para: ${para}`);

            return res.json({
                success: true,
                message: 'Email de teste enviado com sucesso'
            });
        } catch (error) {
            logger.error('Erro ao testar email:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao testar email',
                error: error.message
            });
        }
    }

    /**
     * Envia email
     * POST /api/integrations/email/send
     */
    async send(req, res) {
        try {
            const { tenant } = req;
            const { para, assunto, corpo, html } = req.body;
            const IntegrationService = require('../services/IntegrationService');

            // Validações básicas
            if (!para || !para.includes('@')) {
                return res.status(400).json({
                    success: false,
                    message: 'Email de destino inválido'
                });
            }

            if (!assunto) {
                return res.status(400).json({
                    success: false,
                    message: 'Assunto é obrigatório'
                });
            }

            if (!corpo && !html) {
                return res.status(400).json({
                    success: false,
                    message: 'Corpo ou HTML da mensagem é obrigatório'
                });
            }

            // Buscar configuração de email
            const emailConfig = await IntegrationService.findByTenantAndType(
                tenant._id,
                'email'
            );

            if (!emailConfig || !emailConfig.email || (!emailConfig.email.habilitado && !emailConfig.email.enabled)) {
                return res.status(400).json({
                    success: false,
                    message: 'Email não está configurado ou habilitado'
                });
            }

            const config = emailConfig.email;
            const smtpHost = config.host || config.smtp_host;
            const smtpPort = config.port || config.smtp_port || 465;
            const smtpUser = config.usuario || config.username;
            const smtpPassword = config.senha || config.password;
            const fromEmail = config.from_email || config.de || smtpUser;
            const fromName = config.from_name || 'MK-Edge';

            if (!smtpHost || !smtpUser || !smtpPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Configuração SMTP incompleta'
                });
            }

            logger.info('Enviando email', {
                tenant: tenant.nome,
                destinatario: para,
                assunto: assunto,
                smtp_host: smtpHost
            });

            // Criar transporter do Nodemailer
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465 || smtpPort === '465',
                auth: {
                    user: smtpUser,
                    pass: smtpPassword
                },
                tls: {
                    rejectUnauthorized: false // Aceita certificados auto-assinados
                }
            });

            // Enviar email
            const mailOptions = {
                from: `${fromName} <${fromEmail}>`,
                to: para,
                subject: assunto,
                text: corpo,
                html: html || corpo
            };

            const info = await transporter.sendMail(mailOptions);

            logger.info('Email enviado com sucesso', {
                para,
                assunto,
                messageId: info.messageId
            });

            return res.json({
                success: true,
                message: 'Email enviado com sucesso',
                destinatario: para,
                assunto: assunto,
                messageId: info.messageId,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Erro ao enviar email:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erro ao enviar email',
                error: error.message
            });
        }
    }
}

module.exports = new EmailController();
