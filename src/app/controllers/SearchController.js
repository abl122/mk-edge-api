/**
 * SearchController - Busca Global no Sistema (compatível com backend antigo)
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const StaticMapHelper = require('../helpers/StaticMapHelper');
const logger = require('../../logger');

class SearchController {
  /**
   * Busca global de clientes
   * GET /search?term=&searchmode=&filterBy=
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      const { term = '', searchmode = 'enable', filterBy = '1' } = req.query;

      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }

      if (term === '') {
        return res.json({
          results: [],
          info: { online: 0, offline: 0 }
        });
      }

      const ativoFlag = searchmode === 'enable' ? 's' : 'n';
      const termIsNumber = !Number.isNaN(Number(term));

      let clientesRes;
      if (filterBy === '1') {
        clientesRes = termIsNumber
          ? await MkAuthAgentService.execute(
              tenant,
              'buscarClientesPorDocumento',
              term,
              ativoFlag
            )
          : await MkAuthAgentService.execute(
              tenant,
              'buscarClientesPorNome',
              term,
              ativoFlag
            );
      } else if (filterBy === '2') {
        clientesRes = await MkAuthAgentService.execute(
          tenant,
          'buscarClientesPorCaixa',
          term,
          ativoFlag
        );
      } else if (filterBy === '5') {
        clientesRes = await MkAuthAgentService.execute(
          tenant,
          'buscarClientesPorSSID',
          term,
          ativoFlag
        );
      } else {
        clientesRes = await MkAuthAgentService.execute(
          tenant,
          'buscarClientesPorNome',
          term,
          ativoFlag
        );
      }

      const clientes = clientesRes.data || [];

      // Lista de logins online (para marcar Online/Offline)
      const conectadosRes = await MkAuthAgentService.execute(tenant, 'loginsConectados');
      const conectados = new Set((conectadosRes.data || []).map((c) => c.login));

      let online = 0;
      let offline = 0;

      for (let i = 0; i < clientes.length; i += 1) {
        const cli = clientes[i];
        const isConnected = conectados.has(cli.login);

        // Faturas pendentes
        const faturasRes = await MkAuthAgentService.execute(
          tenant,
          'faturasPendentesCliente',
          cli.login
        );
        const faturas = faturasRes.data || [];
        const pending_invoices = faturas.length;
        const next_due_date = pending_invoices > 0 ? faturas[0].datavenc : null;

        // Coordenadas e mapa
        let latitude = null;
        let longitude = null;
        if (cli.coordenadas) {
          const [lat, lng] = cli.coordenadas.split(',').map((c) => c.trim());
          latitude = parseFloat(lat);
          longitude = parseFloat(lng);
        }
        const static_map_url = await StaticMapHelper.generateStaticMapUrl(latitude, longitude, tenant);

        clientes[i] = {
          ...cli,
          equipment_array: isConnected ? 'Online' : 'Offline',
          pending_invoices,
          next_due_date,
          latitude,
          longitude,
          static_map_url
        };

        if (isConnected) online += 1;
        else offline += 1;
      }

      return res.json({
        results: clientes,
        info: { online, offline }
      });
    } catch (error) {
      logger.error('[SearchController] Erro ao buscar clientes', {
        error: error.message,
        term: req.query.term
      });

      return res.status(500).json({
        error: 'Erro ao buscar clientes',
        message: error.message
      });
    }
  }

  /**
   * Busca cliente por telefone/celular
   * GET /search/phone/:telefone
   */
  async byPhone(req, res) {
    try {
      const { tenant } = req;
      const { telefone } = req.params;

      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }

      const telefoneNumerico = telefone.replace(/\D/g, '');

      const clientesRes = await MkAuthAgentService.execute(
        tenant,
        'buscarClientePorTelefone',
        telefoneNumerico
      );

      const clientes = clientesRes.data || [];

      logger.info(`[SearchController] ${clientes.length || 0} clientes encontrados por telefone`, {
        provedor_id: tenant._id,
        telefone: telefoneNumerico
      });

      return res.json(clientes);
    } catch (error) {
      logger.error('[SearchController] Erro ao buscar por telefone', {
        error: error.message,
        telefone: req.params.telefone
      });

      return res.status(500).json({
        error: 'Erro ao buscar por telefone',
        message: error.message
      });
    }
  }
}

module.exports = new SearchController();
