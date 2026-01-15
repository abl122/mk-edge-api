/**
 * NotificationController - Notificações do Sistema
 * 
 * Implementa consulta de notificações para funcionários/técnicos
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

class NotificationController {
  /**
   * Lista notificações de um funcionário
   * GET /notifications?funcionario_id=123
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      const { funcionario_id, limit } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!funcionario_id) {
        return res.status(400).json({
          error: 'ID do funcionário é obrigatório'
        });
      }
      
      // Busca notificações via agente
      const notificacoes = await MkAuthAgentService.execute(
        tenant,
        'notificacoesFuncionario',
        funcionario_id,
        limit ? parseInt(limit) : 50
      );
      
      logger.info(`[NotificationController] ${notificacoes.length} notificações encontradas`, {
        provedor_id: tenant._id,
        funcionario_id
      });
      
      return res.json(notificacoes);
      
    } catch (error) {
      logger.error('[NotificationController] Erro ao buscar notificações', {
        error: error.message,
        funcionario_id: req.query.funcionario_id
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar notificações',
        message: error.message
      });
    }
  }
  
  /**
   * Conta notificações não lidas
   * GET /notifications/unread?funcionario_id=123
   */
  async unread(req, res) {
    try {
      const { tenant } = req;
      const { funcionario_id } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!funcionario_id) {
        return res.status(400).json({
          error: 'ID do funcionário é obrigatório'
        });
      }
      
      // Busca contagem de não lidas via agente
      const resultado = await MkAuthAgentService.execute(
        tenant,
        'notificacoesNaoLidas',
        funcionario_id
      );
      
      logger.info('[NotificationController] Notificações não lidas consultadas', {
        provedor_id: tenant._id,
        funcionario_id,
        total: resultado[0]?.total || 0
      });
      
      return res.json({
        funcionario_id,
        nao_lidas: resultado[0]?.total || 0
      });
      
    } catch (error) {
      logger.error('[NotificationController] Erro ao contar notificações não lidas', {
        error: error.message,
        funcionario_id: req.query.funcionario_id
      });
      
      return res.status(500).json({
        error: 'Erro ao contar notificações não lidas',
        message: error.message
      });
    }
  }
  
  /**
   * Marca notificação como lida
   * PUT /notifications/:id/read
   * 
   * Nota: Atualização requer UPDATE, não suportado pelo agente.
   */
  async markAsRead(req, res) {
    try {
      return res.status(501).json({
        error: 'Marcação de notificação não implementada via agente',
        message: 'Use a API específica ou conexão direta'
      });
      
    } catch (error) {
      logger.error('[NotificationController] Erro ao marcar notificação', {
        error: error.message,
        notificacao_id: req.params.id
      });
      
      return res.status(500).json({
        error: 'Erro ao marcar notificação',
        message: error.message
      });
    }
  }
}

module.exports = new NotificationController();
