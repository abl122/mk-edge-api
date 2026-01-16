/**
 * CTOController - Gerenciamento de CTOs (Caixas Hermétcas)
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

class CTOController {
  /**
   * Busca CTOs próximas (raio de ~350 metros)
   * GET /cto/:latitude/:longitude
   * 
   * Path params:
   * - latitude: Latitude do ponto de referência
   * - longitude: Longitude do ponto de referência
   * 
   * Response:
   * [
   *   {
   *     id: 1,
   *     nome: "CTO-001",
   *     latitude: -3.0793407,
   *     longitude: -59.9687228,
   *     connection_amount: 45
   *   }
   * ]
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      const { latitude, longitude, lat, lng } = req.params;

      // Aceita latitude/longitude ou lat/lng (aliases)
      const finalLat = parseFloat(latitude || lat);
      const finalLng = parseFloat(longitude || lng);

      if (!finalLat || !finalLng || isNaN(finalLat) || isNaN(finalLng)) {
        return res.status(400).json({
          error: 'latitude e longitude são obrigatórios e devem ser números válidos'
        });
      }

      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }

      console.log('🗺️ [CTOController.index] Buscando CTOs próximas');
      console.log(`📍 Coordenadas: ${finalLat}, ${finalLng}`);

      // Busca CTOs via agente (raio padrão 0.35 km = 350 metros)
      const queryDef = MkAuthAgentService.queries.ctoPorCoordenadas(finalLat, finalLng, 0.35);
      
      const result = await MkAuthAgentService.sendToAgent(
        tenant,
        queryDef.sql,
        queryDef.params
      );

      const ctos = result.data || [];
      console.log(`✅ ${ctos.length} CTOs encontradas`);

      // Para cada CTO, busca quantidade de clientes conectados
      const ctosComClientes = [];

      for (const cto of ctos) {
        try {
          const clientesQuery = MkAuthAgentService.queries.clientesPorCto(cto.nome);
          const clientesResult = await MkAuthAgentService.sendToAgent(
            tenant,
            clientesQuery.sql,
            clientesQuery.params
          );

          const clientes = clientesResult.data || [];
          // Conta apenas clientes ativados
          const clientesAtivos = clientes.filter(c => c.cli_ativado === 's');

          ctosComClientes.push({
            id: cto.id,
            nome: cto.nome,
            latitude: parseFloat(cto.latitude),
            longitude: parseFloat(cto.longitude),
            connection_amount: clientesAtivos.length,
            distance: cto.distance ? parseFloat(cto.distance) : 0
          });
        } catch (error) {
          console.warn(`⚠️ Erro ao buscar clientes para CTO ${cto.nome}:`, error.message);
          // Continua mesmo se falhar para uma CTO
          ctosComClientes.push({
            id: cto.id,
            nome: cto.nome,
            latitude: parseFloat(cto.latitude),
            longitude: parseFloat(cto.longitude),
            connection_amount: 0,
            distance: cto.distance ? parseFloat(cto.distance) : 0
          });
        }
      }

      logger.info('[CTOController.index] CTOs próximas consultadas', {
        service: 'nova-api-mkedge',
        latitude: finalLat,
        longitude: finalLng,
        total_ctos: ctosComClientes.length
      });

      return res.json(ctosComClientes);

    } catch (error) {
      logger.error('[CTOController.index] Erro ao buscar CTOs:', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        error: 'Erro ao buscar CTOs próximas',
        message: error.message
      });
    }
  }

  /**
   * Busca CTO específica por nome
   * GET /cto?cto_name=CTO-001
   */
  async show(req, res) {
    try {
      const { tenant } = req;
      const { cto_name } = req.query;

      if (!cto_name) {
        return res.status(400).json({
          error: 'Nome da CTO é obrigatório (cto_name)'
        });
      }

      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }

      console.log(`🔍 [CTOController.show] Buscando CTO: ${cto_name}`);

      // Busca clientes conectados nesta CTO
      const queryDef = MkAuthAgentService.queries.clientesPorCto(cto_name);
      const result = await MkAuthAgentService.sendToAgent(
        tenant,
        queryDef.sql,
        queryDef.params
      );

      const clientes = result.data || [];
      const clientesAtivos = clientes.filter(c => c.cli_ativado === 's');

      logger.info('[CTOController.show] CTO consultada', {
        service: 'nova-api-mkedge',
        cto_name,
        clientes_ativos: clientesAtivos.length
      });

      return res.json({
        nome: cto_name,
        clientes_ativos: clientesAtivos.length,
        clientes: clientesAtivos
      });

    } catch (error) {
      logger.error('[CTOController.show] Erro ao buscar CTO:', {
        error: error.message,
        cto_name: req.query.cto_name
      });

      return res.status(500).json({
        error: 'Erro ao buscar CTO',
        message: error.message
      });
    }
  }
}

// Cria instância e vincula métodos
const instance = new CTOController();
instance.index = instance.index.bind(instance);
instance.show = instance.show.bind(instance);

module.exports = instance;
