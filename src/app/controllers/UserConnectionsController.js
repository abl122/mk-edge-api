/**
 * UserConnectionsController - Conexões de Usuários
 * 
 * Implementa consulta de conexões e sessões RADIUS
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

class UserConnectionsController {
  /**
   * Lista conexões de um cliente
   * GET /connections?login=cliente123
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      const { login, inicio, fim, limit } = req.query;
      
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
      
      // Busca histórico de conexões via agente
      const conexoes = await MkAuthAgentService.execute(
        tenant,
        'historicoConexoes',
        login,
        inicio || null,
        fim || null,
        limit ? parseInt(limit) : 100
      );
      
      logger.info(`[UserConnectionsController] ${conexoes.length} conexões encontradas`, {
        provedor_id: tenant._id,
        cliente_login: login
      });
      
      return res.json(conexoes);
      
    } catch (error) {
      logger.error('[UserConnectionsController] Erro ao buscar conexões', {
        error: error.message,
        login: req.query.login
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar conexões',
        message: error.message
      });
    }
  }
  
  /**
   * Última conexão do cliente
   * GET /connections/last?login=cliente123
   */
  async last(req, res) {
    try {
      const { tenant } = req;
      const { login } = req.query;
      
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
      
      // Busca última conexão via agente
      const conexoes = await MkAuthAgentService.execute(
        tenant,
        'ultimaConexao',
        login
      );
      
      if (!conexoes || conexoes.length === 0) {
        return res.status(404).json({
          error: 'Nenhuma conexão encontrada'
        });
      }
      
      logger.info('[UserConnectionsController] Última conexão encontrada', {
        provedor_id: tenant._id,
        cliente_login: login
      });
      
      return res.json(conexoes[0]);
      
    } catch (error) {
      logger.error('[UserConnectionsController] Erro ao buscar última conexão', {
        error: error.message,
        login: req.query.login
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar última conexão',
        message: error.message
      });
    }
  }
  
  /**
   * Verifica se cliente está online
   * GET /connections/status?login=cliente123
   */
  async status(req, res) {
    try {
      const { tenant } = req;
      const { login } = req.query;
      
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
      
      // Verifica se está online via agente
      const conexoes = await MkAuthAgentService.execute(
        tenant,
        'clienteOnline',
        login
      );
      
      const online = conexoes && conexoes.length > 0;
      
      logger.info('[UserConnectionsController] Status verificado', {
        provedor_id: tenant._id,
        cliente_login: login,
        online
      });
      
      return res.json({
        login,
        online,
        conexao: online ? conexoes[0] : null
      });
      
    } catch (error) {
      logger.error('[UserConnectionsController] Erro ao verificar status', {
        error: error.message,
        login: req.query.login
      });
      
      return res.status(500).json({
        error: 'Erro ao verificar status',
        message: error.message
      });
    }
  }
  
  /**
   * Detalhes de conexões de um cliente por ID
   * GET /connections/:id?page=1&limit=50
   */
  async show(req, res) {
    try {
      const { tenant } = req;
      const { id: client_id } = req.params;
      const { page = 1, limit = 50 } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca dados do cliente via agente (tenta login ou ID automaticamente)
      const clientes = await MkAuthAgentService.buscarClienteAuto(tenant, client_id);
      
      if (!clientes || clientes.length === 0) {
        return res.status(404).json({
          message: 'No client found'
        });
      }
      
      const cliente = clientes[0];
      
      // Busca histórico de conexões via agente
      const pageNumber = parseInt(page, 10);
      const limitNumber = Math.min(parseInt(limit, 10), 100);
      
      const conexoes = await MkAuthAgentService.execute(
        tenant,
        'historicoConexoesPaginado',
        cliente.login,
        pageNumber,
        limitNumber
      );
      
      if (!conexoes || conexoes.length === 0) {
        return res.json([]);
      }
      
      // Formata resposta no formato esperado pelo app
      const response = conexoes.map(connection => {
        // Calcula duração formatada
        let duration = connection.duration;
        if (duration === '0d') {
          const hours = Math.floor((connection.acctinputoctets + connection.acctoutputoctets) / 3600);
          duration = `${hours}h`;
          if (duration === '0h') {
            const minutes = Math.floor((connection.acctinputoctets + connection.acctoutputoctets) / 60);
            duration = `${minutes}m`;
          }
        }
        
        // Função para calcular octets (upload/download)
        const calcOctets = (value) => {
          let count = 0;
          let newValue = value / 1024; // Bytes -> KB
          count++;
          
          while (newValue >= 1000 && count < 3) {
            newValue = newValue / 1024;
            count++;
          }
          
          const units = ['Kb', 'Mb', 'Gb'];
          return {
            new_value: parseFloat(newValue.toFixed(2)),
            unit: units[count - 1] || 'Gb'
          };
        };
        
        return {
          id: connection.id.toString(),
          start_date: connection.start_date,
          start_time: connection.start_time,
          end_date: connection.end_date,
          end_time: connection.end_time,
          duration,
          upload: calcOctets(connection.acctinputoctets),
          download: calcOctets(connection.acctoutputoctets)
        };
      });
      
      logger.debug(`[UserConnectionsController] ${response.length} conexões formatadas`, {
        provedor_id: tenant._id,
        cliente_id: client_id,
        page: pageNumber
      });
      
      return res.json(response);
      
    } catch (error) {
      logger.error('[UserConnectionsController] Erro ao buscar conexões do cliente', {
        error: error.message,
        client_id: req.params.id
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar conexões do usuário',
        message: error.message
      });
    }
  }
}

// Cria instância e vincula todos os métodos para preservar `this`
const instance = new UserConnectionsController();

// Vincula explicitamente os métodos públicos
instance.index = instance.index.bind(instance);
instance.last = instance.last.bind(instance);
instance.status = instance.status.bind(instance);
instance.show = instance.show.bind(instance);

module.exports = instance;
