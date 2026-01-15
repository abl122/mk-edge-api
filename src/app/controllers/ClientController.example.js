import MkAuthAgentService from '../services/MkAuthAgentService';
import logger from '../../logger';

/**
 * EXEMPLO DE USO: ClientController usando o Agente
 * 
 * Este é um exemplo de como migrar controllers existentes
 * para usar o MkAuthAgentService ao invés de conexão direta
 */
class ClientController {
  
  /**
   * Busca detalhes de um cliente
   * 
   * GET /client/:id
   * GET /cliente/:id
   */
  async show(req, res) {
    try {
      const { id: login } = req.params;
      const { tenant } = req; // Do middleware ConnectionResolver
      
      // Valida se o agente está configurado
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado para este provedor' 
        });
      }
      
      // ✨ BUSCA CLIENTE VIA AGENTE
      const clienteResult = await MkAuthAgentService.execute(
        tenant,
        'clienteCompleto',
        login
      );
      
      if (!clienteResult.success || !clienteResult.data.length) {
        return res.status(404).json({ 
          message: 'Cliente não encontrado' 
        });
      }
      
      const cliente = clienteResult.data[0];
      
      // ✨ BUSCA CONSUMO DO MÊS ATUAL VIA AGENTE
      const consumoResult = await MkAuthAgentService.execute(
        tenant,
        'consumoMesAtual',
        login
      );
      
      const consumo = consumoResult.data[0]?.consumo_total || 0;
      
      // ✨ BUSCA TÍTULOS EM ABERTO VIA AGENTE
      const titulosResult = await MkAuthAgentService.execute(
        tenant,
        'titulosAbertos',
        login
      );
      
      const titulos = titulosResult.data;
      
      // ✨ HISTÓRICO DE CONEXÕES VIA AGENTE
      const historicoResult = await MkAuthAgentService.execute(
        tenant,
        'historicoConexoes',
        login,
        10 // últimas 10 conexões
      );
      
      const historico = historicoResult.data;
      
      // Monta resposta
      return res.json({
        cliente: {
          id: cliente.id,
          login: cliente.login,
          nome: cliente.nome,
          email: cliente.email,
          telefone: cliente.celular,
          endereco: {
            logradouro: cliente.endereco,
            numero: cliente.numero,
            bairro: cliente.bairro,
            complemento: cliente.complemento,
            cep: cliente.cep,
          },
          plano: cliente.plano,
          bloqueado: cliente.bloqueado === 'sim',
          ativo: cliente.cli_ativado === 'sim',
        },
        consumo: {
          mes_atual: consumo,
          mes_atual_formatado: MkAuthAgentService.formatBytes(consumo),
        },
        titulos: {
          total: titulos.length,
          vencidos: titulos.filter(t => new Date(t.vencimento) < new Date()).length,
          lista: titulos,
        },
        historico_conexoes: historico,
      });
      
    } catch (error) {
      logger.error({ 
        error: error.message,
        stack: error.stack 
      }, 'Erro ao buscar cliente');
      
      return res.status(500).json({ 
        message: 'Erro ao buscar dados do cliente',
        error: error.message 
      });
    }
  }
  
  /**
   * Lista clientes ativos
   * 
   * GET /clients
   * GET /clientes
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      const { busca } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      // Se tem busca, procura por endereço
      if (busca) {
        const result = await MkAuthAgentService.execute(
          tenant,
          'clientesPorEndereco',
          busca
        );
        
        return res.json({
          clientes: result.data,
          total: result.count,
        });
      }
      
      // Estatísticas gerais
      const stats = await MkAuthAgentService.execute(
        tenant,
        'estatisticasGerais'
      );
      
      return res.json({
        estatisticas: stats.data[0],
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao listar clientes');
      return res.status(500).json({ message: 'Erro ao listar clientes' });
    }
  }
  
  /**
   * Busca cliente por CPF/CNPJ
   * 
   * GET /client/document/:doc
   */
  async showByDocument(req, res) {
    try {
      const { doc } = req.params;
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      const result = await MkAuthAgentService.execute(
        tenant,
        'clientePorDocumento',
        doc
      );
      
      if (!result.success || !result.data.length) {
        return res.status(404).json({ 
          message: 'Cliente não encontrado' 
        });
      }
      
      return res.json({
        cliente: result.data[0],
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao buscar por documento');
      return res.status(500).json({ message: 'Erro ao buscar cliente' });
    }
  }
  
  /**
   * Dashboard - Clientes online/offline
   * 
   * GET /clients/dashboard
   */
  async dashboard(req, res) {
    try {
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      // Executa queries em paralelo
      const [ativos, online, estatisticas] = await Promise.all([
        MkAuthAgentService.execute(tenant, 'clientesAtivos'),
        MkAuthAgentService.execute(tenant, 'clientesOnline'),
        MkAuthAgentService.execute(tenant, 'estatisticasGerais'),
      ]);
      
      const totalAtivos = ativos.data[0]?.total || 0;
      const totalOnline = online.data[0]?.total || 0;
      
      return res.json({
        clientes: {
          total_ativos: totalAtivos,
          online: totalOnline,
          offline: totalAtivos - totalOnline,
          percentual_online: totalAtivos > 0 
            ? ((totalOnline / totalAtivos) * 100).toFixed(1) 
            : 0,
        },
        estatisticas: estatisticas.data[0],
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Erro no dashboard');
      return res.status(500).json({ message: 'Erro ao carregar dashboard' });
    }
  }
  
  /**
   * Exemplo de query customizada (use com cuidado!)
   * 
   * POST /clients/custom-query
   */
  async customQuery(req, res) {
    try {
      const { tenant } = req;
      const { sql, params } = req.body;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      // AVISO: Use apenas para desenvolvimento/debug
      // Em produção, sempre use queries nomeadas
      logger.warn({ 
        tenant: tenant.nome,
        sql: sql.substring(0, 100) 
      }, 'Query customizada sendo executada');
      
      const result = await MkAuthAgentService.executeCustom(
        tenant,
        sql,
        params
      );
      
      return res.json(result);
      
    } catch (error) {
      logger.error({ error: error.message }, 'Erro em query customizada');
      return res.status(500).json({ message: error.message });
    }
  }
}

export default new ClientController();
