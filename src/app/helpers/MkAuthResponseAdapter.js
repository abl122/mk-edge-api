const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

/**
 * Adapter para converter respostas do Agente MK-Auth
 * para o formato esperado pelo frontend
 * 
 * Resolve incompatibilidades entre:
 * - Agente PHP: { success, data: [...] }
 * - Frontend: Objeto direto ou array
 * 
 * @version 1.0.0
 */
class MkAuthResponseAdapter {
  
  /**
   * Adapta resposta SELECT para formato antigo
   * 
   * @param {Object} apiResponse - Resposta do agente { success, data, count }
   * @param {Boolean} returnFirst - Se true, retorna primeiro item ao invés de array
   * @returns {Object|Array|null} Dados adaptados
   * 
   * @example
   * // Array completo
   * adaptSelect({ success: true, data: [{...}, {...}] })
   * // => [{...}, {...}]
   * 
   * // Primeiro item apenas (busca por ID)
   * adaptSelect({ success: true, data: [{id: 1}] }, true)
   * // => {id: 1}
   */
  static adaptSelect(apiResponse, returnFirst = false) {
    if (!apiResponse || !apiResponse.success) {
      const errorMsg = apiResponse?.error || 'Erro desconhecido ao consultar agente';
      logger.error({ response: apiResponse }, 'Erro no adaptSelect');
      throw new Error(errorMsg);
    }
    
    // Garante que data é array
    const data = Array.isArray(apiResponse.data) ? apiResponse.data : [];
    
    if (returnFirst) {
      // Retorna primeiro item ou null
      return data.length > 0 ? data[0] : null;
    }
    
    // Retorna array completo
    return data;
  }
  
  /**
   * Adapta resposta INSERT
   * Faz busca adicional do registro criado
   * 
   * @param {Object} apiResponse - Resposta do agente { success, insert_id }
   * @param {Object} tenant - Tenant para nova query
   * @param {String} tableName - Nome da tabela
   * @param {String} idField - Nome do campo ID (padrão: 'id')
   * @returns {Object} Registro criado
   * 
   * @example
   * const response = await agent.execute("INSERT INTO...")
   * const newRecord = await adaptInsert(response, tenant, 'sis_cliente', 'id')
   * // => { id: 123, nome: "João", ... }
   */
  static async adaptInsert(apiResponse, tenant, tableName, idField = 'id') {
    if (!apiResponse || !apiResponse.success) {
      const errorMsg = apiResponse?.error || 'Erro ao inserir registro';
      logger.error({ response: apiResponse }, 'Erro no adaptInsert');
      throw new Error(errorMsg);
    }
    
    const insertId = apiResponse.insert_id;
    
    if (!insertId) {
      throw new Error('insert_id não retornado pelo agente');
    }
    
    // Faz query adicional para buscar o registro criado
    const query = {
      sql: `SELECT * FROM ${tableName} WHERE ${idField} = :id LIMIT 1`,
      params: { id: insertId }
    };
    
    const result = await MkAuthAgentService.executeQuery(tenant, query);
    
    return this.adaptSelect(result, true);
  }
  
  /**
   * Adapta resposta UPDATE
   * Faz busca adicional do registro atualizado
   * 
   * @param {Object} apiResponse - Resposta do agente { success, affected_rows }
   * @param {Object} tenant - Tenant para nova query
   * @param {String} tableName - Nome da tabela
   * @param {String} idField - Nome do campo ID
   * @param {any} idValue - Valor do ID
   * @returns {Object|null} Registro atualizado ou null se não afetou linhas
   * 
   * @example
   * const response = await agent.execute("UPDATE sis_cliente SET...")
   * const updated = await adaptUpdate(response, tenant, 'sis_cliente', 'id', 123)
   * // => { id: 123, nome: "João Atualizado", ... }
   */
  static async adaptUpdate(apiResponse, tenant, tableName, idField, idValue) {
    if (!apiResponse || !apiResponse.success) {
      const errorMsg = apiResponse?.error || 'Erro ao atualizar registro';
      logger.error({ response: apiResponse }, 'Erro no adaptUpdate');
      throw new Error(errorMsg);
    }
    
    if (apiResponse.affected_rows === 0) {
      return null; // Nenhum registro foi atualizado
    }
    
    // Faz query adicional para buscar o registro atualizado
    const query = {
      sql: `SELECT * FROM ${tableName} WHERE ${idField} = :${idField} LIMIT 1`,
      params: { [idField]: idValue }
    };
    
    const result = await MkAuthAgentService.executeQuery(tenant, query);
    
    return this.adaptSelect(result, true);
  }
  
  /**
   * Adapta resposta DELETE
   * Retorna apenas confirmação
   * 
   * @param {Object} apiResponse - Resposta do agente { success, affected_rows }
   * @returns {Object} { deleted: boolean, count: number }
   * 
   * @example
   * const response = await agent.execute("DELETE FROM...")
   * adaptDelete(response)
   * // => { deleted: true, count: 1 }
   */
  static adaptDelete(apiResponse) {
    if (!apiResponse || !apiResponse.success) {
      const errorMsg = apiResponse?.error || 'Erro ao deletar registro';
      logger.error({ response: apiResponse }, 'Erro no adaptDelete');
      throw new Error(errorMsg);
    }
    
    return {
      deleted: apiResponse.affected_rows > 0,
      count: apiResponse.affected_rows || 0
    };
  }
  
  /**
   * Agrega múltiplas queries em um único objeto
   * Útil para dashboard/estatísticas
   * 
   * @param {Array} responses - Array de { key, response }
   * @returns {Object} Objeto agregado com todas as keys
   * 
   * @example
   * const responses = [
   *   { key: 'active_clients', response: { success: true, data: [{total: 150}] } },
   *   { key: 'online_clients', response: { success: true, data: [{total: 45}] } }
   * ];
   * aggregateStats(responses)
   * // => { active_clients: 150, online_clients: 45 }
   */
  static aggregateStats(responses) {
    const stats = {};
    
    responses.forEach(({ key, response }) => {
      try {
        if (response && response.success && response.data && response.data.length > 0) {
          const firstRow = response.data[0];
          // Pega o primeiro valor do primeiro registro
          const firstValue = Object.values(firstRow)[0];
          stats[key] = firstValue;
        } else {
          // Se não tem dados, retorna 0
          stats[key] = 0;
        }
      } catch (error) {
        logger.error({ key, error: error.message }, 'Erro ao agregar stat');
        stats[key] = 0;
      }
    });
    
    return stats;
  }
  
  /**
   * Calcula campos derivados para cliente
   * Replica lógica do backend antigo
   * 
   * @param {Object} client - Cliente básico do banco
   * @param {Object} tenant - Tenant para queries adicionais
   * @returns {Object} Cliente com campos calculados
   * 
   * @example
   * const client = await adaptSelect(response, true)
   * const enriched = await enrichClient(client, tenant)
   * // => { ...client, dataUsage: 123456, connections: [...] }
   */
  static async enrichClient(client, tenant) {
    if (!client) return null;
    
    try {
      // Consumo do mês atual
      const consumoQuery = MkAuthAgentService.queries.consumoMesAtual(client.login);
      const consumoResult = await MkAuthAgentService.executeQuery(tenant, consumoQuery);
      const dataUsage = this.adaptSelect(consumoResult, true)?.consumo_total || 0;
      
      // Histórico de conexões recentes (últimas 10)
      const conexoesQuery = MkAuthAgentService.queries.historicoConexoes(client.login, 10);
      const conexoesResult = await MkAuthAgentService.executeQuery(tenant, conexoesQuery);
      const connections = this.adaptSelect(conexoesResult, false);
      
      return {
        ...client,
        dataUsage: parseInt(dataUsage, 10),
        connections: connections || []
      };
      
    } catch (error) {
      logger.error({ 
        login: client.login, 
        error: error.message 
      }, 'Erro ao enriquecer cliente');
      
      // Retorna cliente sem campos calculados se houver erro
      return {
        ...client,
        dataUsage: 0,
        connections: []
      };
    }
  }
  
  /**
   * Formata lista de clientes para o formato antigo
   * Mapeia 'data' → 'clients', adiciona metadados
   * 
   * @param {Object} apiResponse - Resposta do agente
   * @param {Number} page - Página atual (opcional)
   * @param {Number} limit - Limite por página (opcional)
   * @returns {Object} { clients: [...], total, page, limit }
   */
  static adaptClientList(apiResponse, page = 1, limit = 50) {
    const data = this.adaptSelect(apiResponse, false);
    
    return {
      clients: data,
      total: apiResponse.count || data.length,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil((apiResponse.count || data.length) / limit)
    };
  }
  
  /**
   * Formata lista de faturas para o formato antigo
   * Mapeia 'data' → 'invoices', adiciona metadados
   * 
   * @param {Object} apiResponse - Resposta do agente
   * @param {Number} page - Página atual (opcional)
   * @param {Number} limit - Limite por página (opcional)
   * @returns {Object} { invoices: [...], total, page, limit }
   */
  static adaptInvoiceList(apiResponse, page = 1, limit = 50) {
    const data = this.adaptSelect(apiResponse, false);
    
    return {
      invoices: data,
      total: apiResponse.count || data.length,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil((apiResponse.count || data.length) / limit)
    };
  }
}

module.exports = MkAuthResponseAdapter;
