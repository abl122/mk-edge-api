const MkAuthAgentService = require('../services/MkAuthAgentService');
const MkAuthResponseAdapter = require('../helpers/MkAuthResponseAdapter');
const StaticMapHelper = require('../helpers/StaticMapHelper');
const { format, subMonths, getDate, getDaysInMonth, addHours } = require('date-fns');
const { ptBR } = require('date-fns/locale');
const logger = require('../../logger');

/**
 * ClientController - Gerenciamento de Clientes
 * 
 * Usa MkAuthAgentService + MkAuthResponseAdapter
 * Mantém compatibilidade com frontend existente
 */
class ClientController {
  
  /**
   * Busca detalhes de um cliente por ID ou Login
   * 
   * GET /client/:id
   */
  async showById(req, res) {
    try {
      const { id } = req.params;
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado para este provedor' 
        });
      }
      
      logger.info('[ClientController.showById] Iniciando busca de cliente', {
        client_id: id,
        tenant_nome: tenant?.nome,
        tenant_agente_url: tenant?.agente?.url
      });
      
      // Busca cliente por ID ou Login
      const isNumeric = !isNaN(id) && !isNaN(parseFloat(id));
      const operation = isNumeric ? 'buscarCliente' : 'buscarClientePorLogin';
      const result = await MkAuthAgentService.execute(tenant, operation, id);
      
      console.log('\n🔍 [DEBUG] ClientController.showById result:', {
        type: typeof result,
        keys: result ? Object.keys(result) : null,
        has_data: !!result?.data,
        data_length: result?.data?.length,
        data: result?.data
      });
      
      logger.info('[ClientController.showById] Resultado completo do agente', {
        client_id: id,
        result_type: typeof result,
        result_keys: result ? Object.keys(result) : 'null',
        result_data: result?.data ? `array com ${result.data.length} itens` : 'undefined/null',
        result_success: result?.success,
        result_error: result?.error,
        result_count: result?.count
      });
      
      if (!result.data || result.data.length === 0) {
        console.log('🚨 [DEBUG] Retornando 404 - resultado vazio');
        logger.warn('[ClientController.showById] Cliente não encontrado', {
          client_id: id,
          has_data: !!result?.data,
          data_length: result?.data?.length
        });
        return res.status(404).json({ 
          message: 'Cliente não encontrado' 
        });
      }
      
      console.log('✅ [DEBUG] Cliente encontrado:', result.data[0].nome);
      
      const client = result.data[0];
      
      // Enriquece replicando campos esperados pelo frontend antigo
      const enrichedClient = await this._enrichClientLegacy(client, tenant);
      
      logger.info('[ClientController] Cliente consultado por ID', {
        provedor_id: tenant._id,
        client_id: id
      });
      
      return res.json(enrichedClient);
      
    } catch (error) {
      logger.error('[ClientController] Erro ao buscar cliente por ID', { 
        client_id: req.params.id,
        error: error.message
      });
      
      return res.status(500).json({ 
        message: 'Erro ao buscar dados do cliente',
        error: error.message 
      });
    }
  }
  
  /**
   * Busca detalhes de um cliente por login
   * 
   * GET /clients/:login
   * GET /api/clients/:login
   */
  async show(req, res) {
    try {
      const { login } = req.params;
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado para este provedor' 
        });
      }
      
      // Busca cliente completo
      const query = MkAuthAgentService.queries.clienteCompleto(login);
      const result = await MkAuthAgentService.executeQuery(tenant, query);
      
      // Adapta resposta (retorna primeiro item)
      const client = MkAuthResponseAdapter.adaptSelect(result, true);
      
      if (!client) {
        return res.status(404).json({ 
          message: 'Cliente não encontrado' 
        });
      }
      
      // Enriquece replicando campos esperados pelo frontend antigo
      const enrichedClient = await this._enrichClientLegacy(client, tenant);
      
      logger.info({
        login,
        tenant: tenant.nome
      }, 'Cliente consultado com sucesso');
      
      return res.json(enrichedClient);
      
    } catch (error) {
      logger.error({ 
        login: req.params.login,
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
   * GET /api/clients
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      const { page = 1, limit = 50, search } = req.query;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      let query;
      
      if (search) {
        // Busca por nome ou login
        query = {
          sql: `SELECT * FROM sis_cliente 
                WHERE (nome LIKE :search OR login LIKE :search)
                  AND cli_ativado = 's'
                ORDER BY nome ASC
                LIMIT :limit OFFSET :offset`,
          params: { 
            search: `%${search}%`,
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
          }
        };
      } else {
        // Lista todos
        query = {
          sql: `SELECT * FROM sis_cliente 
                WHERE cli_ativado = 's'
                ORDER BY nome ASC
                LIMIT :limit OFFSET :offset`,
          params: { 
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
          }
        };
      }
      
      const result = await MkAuthAgentService.executeQuery(tenant, query);
      
      // Adapta para formato de lista com paginação
      const response = MkAuthResponseAdapter.adaptClientList(result, page, limit);
      
      logger.info({
        tenant: tenant.nome,
        page,
        limit,
        total: response.total
      }, 'Lista de clientes consultada');
      
      return res.json(response);
      
    } catch (error) {
      logger.error({ 
        error: error.message,
        stack: error.stack 
      }, 'Erro ao listar clientes');
      
      return res.status(500).json({ 
        message: 'Erro ao listar clientes',
        error: error.message 
      });
    }
  }
  
  /**
   * Cria novo cliente
   * 
   * POST /clients
   * POST /api/clients
   */
  async store(req, res) {
    try {
      const { tenant } = req;
      const clientData = req.body;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      // Validações básicas
      if (!clientData.login || !clientData.nome) {
        return res.status(400).json({
          message: 'Login e nome são obrigatórios'
        });
      }
      
      // Monta query INSERT usando as mesmas colunas do backend antigo
      const query = {
        sql: `INSERT INTO sis_cliente 
              (login, nome, email, celular, fone, endereco_res, numero_res, bairro_res, 
               complemento_res, cep, plano, cli_ativado, bloqueado)
              VALUES 
              (:login, :nome, :email, :celular, :fone, :endereco_res, :numero_res, :bairro_res,
               :complemento_res, :cep, :plano, 's', 'n')`,
        params: {
          login: clientData.login,
          nome: clientData.nome,
          email: clientData.email || '',
          celular: clientData.celular || '',
          fone: clientData.fone || '',
          endereco_res: clientData.endereco_res || clientData.endereco || '',
          numero_res: clientData.numero_res || clientData.numero || '',
          bairro_res: clientData.bairro_res || clientData.bairro || '',
          complemento_res: clientData.complemento_res || clientData.complemento || '',
          cep: clientData.cep || '',
          plano: clientData.plano || ''
        }
      };
      
      const result = await MkAuthAgentService.executeQuery(tenant, query);
      
      // Adapta INSERT (busca o registro criado)
      const newClient = await MkAuthResponseAdapter.adaptInsert(
        result, 
        tenant, 
        'sis_cliente', 
        'id'
      );
      
      logger.info({
        login: clientData.login,
        id: newClient.id,
        tenant: tenant.nome
      }, 'Cliente criado com sucesso');
      
      return res.status(201).json(newClient);
      
    } catch (error) {
      logger.error({ 
        error: error.message,
        stack: error.stack 
      }, 'Erro ao criar cliente');
      
      return res.status(500).json({ 
        message: 'Erro ao criar cliente',
        error: error.message 
      });
    }
  }
  
  /**
   * Atualiza dados de um cliente
   * 
   * PUT /clients/:login
   * PATCH /clients/:login
   */
  async update(req, res) {
    try {
      const loginParam = String(req.params.login).trim();
      const { tenant } = req;
      const updateData = req.body;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      // Diferencia se é login (CPF/CNPJ com 11-14 chars) ou ID (numérico até 10 dígitos)
      // CPF = 11 dígitos, CNPJ = 14 dígitos
      const isLoginFormat = (loginParam.length === 11 || loginParam.length === 14);
      const whereField = isLoginFormat ? 'login' : 'id';
      const whereValue = isLoginFormat ? loginParam : parseInt(loginParam);
      
      logger.info('[ClientController.update] Detectando tipo de identificador', {
        loginParam,
        loginLength: loginParam.length,
        isLoginFormat,
        whereField,
        whereValue
      });
      
      // Verifica se cliente existe
      let checkQuery;
      if (isLoginFormat) {
        checkQuery = MkAuthAgentService.queries.clientePorLogin(loginParam);
      } else {
        checkQuery = MkAuthAgentService.queries.buscarCliente(whereValue);
      }
      const checkResult = await MkAuthAgentService.executeQuery(tenant, checkQuery);
      const existingClient = MkAuthResponseAdapter.adaptSelect(checkResult, true);
      
      if (!existingClient) {
        return res.status(404).json({ 
          message: 'Cliente não encontrado' 
        });
      }
      
      // Monta query UPDATE dinâmica
      const fields = [];
      const params = {};
      params[whereField] = whereValue;
      
      if (updateData.nome) {
        fields.push('nome = :nome');
        params.nome = updateData.nome;
      }
      if (updateData.email !== undefined) {
        fields.push('email = :email');
        params.email = updateData.email;
      }
      if (updateData.celular !== undefined) {
        fields.push('celular = :celular');
        params.celular = updateData.celular;
      }
      if (updateData.fone !== undefined) {
        fields.push('fone = :fone');
        params.fone = updateData.fone;
      }
      if (updateData.endereco_res !== undefined || updateData.endereco !== undefined) {
        fields.push('endereco_res = :endereco_res');
        params.endereco_res = updateData.endereco_res || updateData.endereco || '';
      }
      if (updateData.numero_res !== undefined || updateData.numero !== undefined) {
        fields.push('numero_res = :numero_res');
        params.numero_res = updateData.numero_res || updateData.numero || '';
      }
      if (updateData.bairro_res !== undefined || updateData.bairro !== undefined) {
        fields.push('bairro_res = :bairro_res');
        params.bairro_res = updateData.bairro_res || updateData.bairro || '';
      }
      if (updateData.complemento_res !== undefined || updateData.complemento !== undefined) {
        fields.push('complemento_res = :complemento_res');
        params.complemento_res = updateData.complemento_res || updateData.complemento || '';
      }
      if (updateData.plano !== undefined) {
        fields.push('plano = :plano');
        params.plano = updateData.plano;
      }
      
      // Atualiza coordenadas (latitude/longitude ou string única)
      if ((updateData.latitude !== undefined && updateData.longitude !== undefined) || 
          updateData.coordenadas !== undefined) {
        let coordenadas = updateData.coordenadas;
        if (!coordenadas && updateData.latitude !== undefined && updateData.longitude !== undefined) {
          coordenadas = `${updateData.latitude},${updateData.longitude}`;
        }
        if (coordenadas) {
          fields.push('coordenadas = :coordenadas');
          params.coordenadas = coordenadas;
        }
      }
      
      // Atualiza CTO/Caixa Hermética (aceita new_cto ou caixa_herm)
      if (updateData.new_cto !== undefined || updateData.caixa_herm !== undefined) {
        fields.push('caixa_herm = :caixa_herm');
        params.caixa_herm = updateData.new_cto || updateData.caixa_herm;
      }
      
      // Atualiza observação
      if (updateData.observacao !== undefined) {
        fields.push('observacao = :observacao');
        params.observacao = updateData.observacao;
        
        // Se tem data, atualiza rem_obs
        if (updateData.rem_obs !== undefined) {
          fields.push('rem_obs = :rem_obs');
          params.rem_obs = updateData.rem_obs;
        } else if (updateData.date !== undefined) {
          // Tenta parsear date se fornecido
          try {
            const parsedDate = new Date(updateData.date).toISOString().slice(0, 19).replace('T', ' ');
            fields.push('rem_obs = :rem_obs');
            params.rem_obs = parsedDate;
          } catch (err) {
            logger.warn('[ClientController.update] Erro ao parsear data:', err);
          }
        }
      }
      
      // Atualiza automac (quando ativado, zera mac e seta automac='sim')
      if (updateData.automac === true || updateData.automac === 'sim') {
        fields.push('mac = NULL, automac = :automac');
        params.automac = 'sim';
      }
      
      if (fields.length === 0) {
        return res.status(400).json({
          message: 'Nenhum campo para atualizar'
        });
      }
      
      const query = {
        sql: `UPDATE sis_cliente SET ${fields.join(', ')} WHERE ${whereField} = :${whereField}`,
        params
      };
      
      const result = await MkAuthAgentService.executeQuery(tenant, query);
      
      // Adapta UPDATE (busca o registro atualizado)
      const updatedClient = await MkAuthResponseAdapter.adaptUpdate(
        result,
        tenant,
        'sis_cliente',
        whereField,
        whereValue
      );
      
      if (!updatedClient) {
        return res.status(404).json({
          message: 'Cliente não encontrado após atualização'
        });
      }
      
      logger.info({
        clientId: whereValue,
        clientType: whereField,
        tenant: tenant.nome,
        updatedFields: Object.keys(updateData)
      }, 'Cliente atualizado com sucesso');
      
      return res.json(updatedClient);
      
    } catch (error) {
      logger.error({ 
        clientId: loginParam,
        error: error.message,
        stack: error.stack 
      }, 'Erro ao atualizar cliente');
      
      return res.status(500).json({ 
        message: 'Erro ao atualizar cliente',
        error: error.message 
      });
    }
  }
  
  /**
   * Remove um cliente
   * 
   * DELETE /clients/:login
   */
  async destroy(req, res) {
    try {
      const { login } = req.params;
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(503).json({ 
          message: 'Agente não configurado' 
        });
      }
      
      // Verifica se cliente existe
      const checkQuery = MkAuthAgentService.queries.clientePorLogin(login);
      const checkResult = await MkAuthAgentService.executeQuery(tenant, checkQuery);
      const existingClient = MkAuthResponseAdapter.adaptSelect(checkResult, true);
      
      if (!existingClient) {
        return res.status(404).json({ 
          message: 'Cliente não encontrado' 
        });
      }
      
      // Delete (soft delete - marca como inativo)
      const query = {
        sql: `UPDATE sis_cliente SET cli_ativado = 'n' WHERE login = :login`,
        params: { login }
      };
      
      const result = await MkAuthAgentService.executeQuery(tenant, query);
      
      // Adapta DELETE
      const deleteResult = MkAuthResponseAdapter.adaptDelete(result);
      
      logger.info({
        login,
        tenant: tenant.nome
      }, 'Cliente removido (soft delete)');
      
      return res.json({ 
        message: 'Cliente removido com sucesso',
        deleted: deleteResult.deleted
      });
      
    } catch (error) {
      logger.error({ 
        login: req.params.login,
        error: error.message,
        stack: error.stack 
      }, 'Erro ao remover cliente');
      
      return res.status(500).json({ 
        message: 'Erro ao remover cliente',
        error: error.message 
      });
    }
  }

  /**
   * Replica enriquecimento do backend antigo para manter formato esperado pelo app
   */
  async _enrichClientLegacy(client, tenant) {
    try {
      const login = client.login;

      // Consumo do mês atual
      const inicioMes = format(new Date(), 'yyyy-MM-01 00:00:00');
      const agora = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
      const consumoAtualRes = await MkAuthAgentService.execute(
        tenant,
        'consumoAgregadoPeriodo',
        login,
        inicioMes,
        agora
      );
      const consumoAtual = consumoAtualRes.data?.[0]?.total || 0;

      // Consumos dos meses anteriores (5 meses)
      const periodos = [1, 2, 3, 4, 5];
      const consumos = [];
      for (const offset of periodos) {
        const inicio = format(subMonths(new Date(), offset), 'yyyy-MM-01 00:00:00');
        const fim = offset === 1
          ? inicioMes
          : format(subMonths(new Date(), offset - 1), 'yyyy-MM-01 00:00:00');

        const res = await MkAuthAgentService.execute(
          tenant,
          'consumoAgregadoPeriodo',
          login,
          inicio,
          fim
        );
        consumos.push(res.data?.[0]?.total || 0);
      }

      const [secondToLast, thirdToLast, fourthToLast, fifthToLast, sixthToLast] = consumos;

      // Última conexão
      const ultimaCon = await MkAuthAgentService.execute(
        tenant,
        'ultimaConexao',
        login
      );
      const conexao = ultimaCon.data?.[0] || null;

      let equipment_status = 'Offline';
      let current_user_connection = 'Não há conexões';
      if (conexao) {
        const tzOffset = new Date().getTimezoneOffset() / 60;
        if (conexao.acctstarttime) {
          const parsedStart = addHours(new Date(conexao.acctstarttime), tzOffset);
          const parsedDate = format(parsedStart, 'dd/MM/yyyy');
          const parsedTime = format(parsedStart, 'HH:mm');
          current_user_connection = `${parsedDate} às ${parsedTime}`;
        }
        equipment_status = conexao.acctstoptime === null ? 'Online' : 'Offline';
      }

      // Caixa hermética válida
      let caixa_herm = client.caixa_herm;
      if (caixa_herm) {
        const ctoRes = await MkAuthAgentService.execute(
          tenant,
          'ctoPorNome',
          caixa_herm
        );
        const ctoFound = ctoRes.data?.[0] || null;
        if (!ctoFound) {
          caixa_herm = null;
        }
      }

      // Coordenadas e mapa
      let latitude = null;
      let longitude = null;
      if (client.coordenadas) {
        const [lat, lng] = client.coordenadas.split(',').map((c) => c.trim());
        latitude = parseFloat(lat);
        longitude = parseFloat(lng);
      }

      const static_map_url = await StaticMapHelper.generateStaticMapUrl(latitude, longitude, tenant);

      // Estado financeiro - verifica múltiplas variações de valores booleanos
      let finance_state = 'Liberado';
      const bloqueado = String(client.bloqueado || '').toLowerCase().trim();
      const observacao = String(client.observacao || '').toLowerCase().trim();
      
      if (bloqueado === 'sim' || bloqueado === 's' || bloqueado === 'true' || bloqueado === '1') {
        finance_state = 'Bloqueado';
      } else if (observacao === 'sim' || observacao === 's' || observacao === 'true' || observacao === '1') {
        finance_state = 'Em observação';
      }

      const days_in_current_month = getDate(new Date());
      const consuption_average = (
        consumoAtual /
        1024 /
        1024 /
        1024 /
        days_in_current_month
      ).toFixed(2);

      const graph_obj = {
        labels: periodos
          .map((offset) => format(subMonths(new Date(), offset), 'MMM', { locale: ptBR }))
          .map((label) => label.charAt(0).toUpperCase() + label.slice(1))
          .reverse(),
        datasets: [
          {
            data: [
              (sixthToLast / 1024 / 1024 / 1024).toFixed(2),
              (fifthToLast / 1024 / 1024 / 1024).toFixed(2),
              (fourthToLast / 1024 / 1024 / 1024).toFixed(2),
              (thirdToLast / 1024 / 1024 / 1024).toFixed(2),
              (secondToLast / 1024 / 1024 / 1024).toFixed(2)
            ]
          }
        ]
      };

      return {
        ...client,
        caixa_herm,
        finance_state: finance_state || 'Liberado', // Garante que sempre tem um valor
        current_data_usage: (consumoAtual / 1024 / 1024 / 1024).toFixed(2),
        consuption_average,
        expected_consuption: (consuption_average * getDaysInMonth(new Date())).toFixed(2),
        second_to_last_data_usage: secondToLast / 1024 / 1024 / 1024,
        third_to_last_data_usage: thirdToLast / 1024 / 1024 / 1024,
        current_user_connection,
        equipment_status,
        graph_obj,
        latitude,
        longitude,
        static_map_url
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao enriquecer cliente (legacy)');
      return client;
    }
  }
}

// Cria instância e vincula todos os métodos para preservar `this`
const instance = new ClientController();

// Vincula explicitamente os métodos públicos para garantir que `this` seja preservado
instance.showById = instance.showById.bind(instance);
instance.show = instance.show.bind(instance);
instance.index = instance.index.bind(instance);
instance.store = instance.store.bind(instance);
instance.update = instance.update.bind(instance);

module.exports = instance;
