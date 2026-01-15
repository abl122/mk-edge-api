const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

/**
 * Helper para gerar URLs de mapas estáticos do Google Maps
 */
class StaticMapHelper {
  /**
   * Gera URL do Google Static Maps API
   * @param {number} latitude
   * @param {number} longitude
   * @param {object} tenant
   * @returns {Promise<string|null>}
   */
  static async generateStaticMapUrl(latitude, longitude, tenant) {
    if (!latitude || !longitude || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return null;
    }

    // 1) Prioriza variável de ambiente
    let key = process.env.GOOGLE_MAPS_API_KEY;

    // 2) Busca na base via agente (sis_opcao) se não tiver
    if (!key) {
      try {
        const result = await MkAuthAgentService.execute(tenant, 'googleMapsApiKey');
        key = result?.data?.[0]?.valor;
      } catch (err) {
        logger.warn({ err: err.message }, 'Não foi possível buscar key_googlemaps');
      }
    }

    if (!key) return null;

    const url =
      'https://maps.googleapis.com/maps/api/staticmap?' +
      `center=${latitude},${longitude}` +
      '&zoom=15' +
      '&size=600x400' +
      `&markers=color:red%7C${latitude},${longitude}` +
      `&key=${key}`;

    return url;
  }
}

module.exports = StaticMapHelper;
