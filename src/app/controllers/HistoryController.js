/**
 * HistoryController - Histórico de Ações
 * 
 * Implementa consulta de histórico de chamados e alterações
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

class HistoryController {
  /**
   * Histórico de chamados de um cliente
   * GET /history/requests?login=cliente123
   */
  async requests(req, res) {
    try {
      const { tenant } = req;
      const { login, limit } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      if (!login) {
        return res.status(400).json({
          error: 'Login do cliente é obrigatório'
        });
      }
      
      // Busca histórico via agente
      const historico = await MkAuthAgentService.execute(
        tenant,
        'historicoChamadosCliente',
        login,
        limit ? parseInt(limit) : 50
      );
      
      logger.info(`[HistoryController] ${historico.length} chamados no histórico`, {
        provedor_id: tenant._id,
        cliente_login: login
      });
      
      return res.json(historico);
      
    } catch (error) {
      logger.error('[HistoryController] Erro ao buscar histórico', {
        error: error.message,
        login: req.query.login
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar histórico',
        message: error.message
      });
    }
  }
  
  /**
   * Histórico de alterações de um chamado
   * GET /history/changes/:chamado_id
   */
  async changes(req, res) {
    try {
      const { tenant } = req;
      const { chamado_id } = req.params;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca alterações via agente
      const alteracoes = await MkAuthAgentService.execute(
        tenant,
        'historicoAlteracoes',
        chamado_id
      );
      
      logger.info(`[HistoryController] ${alteracoes.length} alterações encontradas`, {
        provedor_id: tenant._id,
        chamado_id
      });
      
      return res.json(alteracoes);
      
    } catch (error) {
      logger.error('[HistoryController] Erro ao buscar alterações', {
        error: error.message,
        chamado_id: req.params.chamado_id
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar alterações',
        message: error.message
      });
    }
  }
}

module.exports = new HistoryController();
