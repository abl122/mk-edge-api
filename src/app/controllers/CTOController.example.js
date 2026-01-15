import MkAuthAgentService from '../services/MkAuthAgentService';
import logger from '../../logger';

/**
 * Controller para gerenciar CTOs (Caixas Hermétcas)
 */
class CTOController {
  
  /**
   * Busca CTOs próximas de uma coordenada
   * 
   * GET /cto/:lat/:lng
   * GET /cto/:latitude/:longitude
   */
  async index(req, res) {
    try {
      const { lat, lng, latitude, longitude } = req.params;
      const { raio = 0.35 } = req.query; // raio em km, padrão 350m
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      const latCoord = lat || latitude;
      const lngCoord = lng || longitude;
      
      if (!latCoord || !lngCoord) {
        return res.status(400).json({ 
          message: 'Coordenadas inválidas' 
        });
      }
      
      // Busca CTOs próximas
      const result = await MkAuthAgentService.execute(
        tenant,
        'ctoPorCoordenadas',
        parseFloat(latCoord),
        parseFloat(lngCoord),
        parseFloat(raio)
      );
      
      return res.json({
        success: true,
        ctos: result.data,
        total: result.count,
        raio_km: raio,
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao buscar CTOs');
      return res.status(500).json({ 
        message: 'Erro ao buscar CTOs próximas' 
      });
    }
  }
  
  /**
   * Lista clientes conectados em uma CTO
   * 
   * GET /cto/:id/clients
   */
  async showClients(req, res) {
    try {
      const { id } = req.params;
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      const result = await MkAuthAgentService.execute(
        tenant,
        'clientesPorCto',
        id
      );
      
      return res.json({
        cto_id: id,
        clientes: result.data,
        total: result.count,
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao buscar clientes da CTO');
      return res.status(500).json({ 
        message: 'Erro ao buscar clientes da CTO' 
      });
    }
  }
}

export default new CTOController();
