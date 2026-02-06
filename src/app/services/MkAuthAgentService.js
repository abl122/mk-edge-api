const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../logger');

/**
 * Serviço de comunicação com o Agente MK-Auth
 * 
 * Responsável por:
 * - Enviar queries para o agente PHP instalado no servidor do provedor
 * - Gerenciar autenticação HMAC
 * - Encriptação AES-256 de queries (opcional)
 * - Biblioteca centralizada de queries
 * - Tratamento de erros e retry
 * 
 * @version 2.0.0
 */
class MkAuthAgentService {
  
  /**
   * Encripta query usando AES-256-CBC
   * Compatível com PHP openssl_encrypt/openssl_decrypt
   * 
   * @param {string} sql - Query SQL a encriptar
   * @param {string} encryptionKey - Chave de encriptação (32 bytes para AES-256)
   * @returns {string} IV + encrypted data em hex (IV necessário para descriptografia)
   */
  static encryptQuery(sql, encryptionKey) {
    if (!encryptionKey) {
      return sql; // Sem chave, retorna plain text
    }
    
    try {
      // Gera IV aleatório (16 bytes para CBC)
      const iv = crypto.randomBytes(16);
      
      // Normaliza a chave para 32 bytes
      const key = crypto.createHash('sha256').update(encryptionKey).digest();
      
      // Encripta
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(sql, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Retorna IV + encrypted (necessário para descriptografia no agente)
      // Formato: ivHex:encryptedHex
      return iv.toString('hex') + ':' + encrypted;
      
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao encriptar query');
      return sql; // Fallback para plain text
    }
  }
  
  /**
   * Descriptografa query (para testes locais)
   * 
   * @param {string} encryptedData - IV + encrypted em hex (formato: ivHex:encryptedHex)
   * @param {string} encryptionKey - Chave de encriptação
   * @returns {string} SQL descriptografado
   */
  static decryptQuery(encryptedData, encryptionKey) {
    try {
      const [ivHex, encryptedHex] = encryptedData.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.createHash('sha256').update(encryptionKey).digest();
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error({ error: error.message }, 'Erro ao descriptografar query');
      return encryptedData;
    }
  }
  
  /**
   * Biblioteca centralizada de queries
   * Todas as queries do sistema devem estar aqui
   */
  static queries = {
    
    /**
     * Busca cliente por login
     * NOTA: Campos omitidos por causarem erro 500: vencimento, dia_bloq
     */
    clientePorLogin: (login) => {
      return {
        sql: `SELECT id, login, nome, cpf_cnpj, senha, plano, tipo, 
                     cli_ativado, bloqueado, observacao, rem_obs,
                     ip, mac, automac, equipamento, ssid,
                     endereco_res, numero_res, bairro_res, complemento_res, cep_res, cidade_res,
                     fone, celular, ramal, email,
                     coordenadas, caixa_herm, porta_olt, porta_splitter,
                     status_corte, cadastro, data_ins,
                     tit_abertos, tit_vencidos
              FROM sis_cliente WHERE login = :login LIMIT 1`,
        params: { login }
      };
    },
    
    /**
     * Busca todos os dados do cliente (todos os campos)
     * NOTA: Campos omitidos por causarem erro 500: vencimento, dia_bloq
     */
    clienteCompleto: (login) => {
      const safeLogin = (login || '').replace(/['"\\]/g, '');
      return {
        sql: `SELECT login, id, nome, cpf_cnpj, senha, plano, tipo, 
                     cli_ativado, bloqueado, observacao, rem_obs,
                     ip, mac, automac, equipamento, ssid,
                     endereco_res, numero_res, bairro_res, complemento_res, cep_res, cidade_res,
                     fone, celular, ramal, email,
                     coordenadas, caixa_herm, porta_olt, porta_splitter,
                     status_corte, cadastro, data_ins,
                     tit_abertos, tit_vencidos
              FROM sis_cliente WHERE login = '${safeLogin}' LIMIT 1`,
        params: {}
      };
    },
    
    /**
     * Busca títulos em aberto de um cliente
     * Campos baseados no modelo Invoice.js do backend-antigo
     */
    titulosAbertos: (login) => {
      const safeLogin = (login || '').replace(/['"\\]/g, '');
      return {
        sql: `SELECT id, uuid_lanc, datavenc, datapag, datadel, valor, status, 
                     login, tipo, obs, linhadig, coletor, formapag, valorpag
              FROM sis_lanc 
              WHERE login = '${safeLogin}' 
                AND datadel IS NULL
                AND status IN ('aberto', 'vencido')
              ORDER BY datavenc ASC`,
        params: {}
      };
    },
    
    /**
     * Busca títulos vencidos
     * Campos baseados no modelo Invoice.js do backend-antigo
     */
    titulosVencidos: (login) => {
      const safeLogin = (login || '').replace(/['"\\]/g, '');
      return {
        sql: `SELECT id, uuid_lanc, datavenc, datapag, datadel, valor, status, 
                     login, tipo, obs, linhadig, coletor, formapag, valorpag
              FROM sis_lanc 
              WHERE login = '${safeLogin}' 
                AND datadel IS NULL
                AND status IN ('aberto', 'vencido')
                AND datavenc < CURDATE()
              ORDER BY datavenc ASC`,
        params: {}
      };
    },
    
    /**
     * Busca títulos pagos de um cliente
     */
    titulosPagos: (login) => {
      const safeLogin = (login || '').replace(/['"\\]/g, '');
      return {
        sql: `SELECT id, uuid_lanc, datavenc, datapag, datadel, valor, status, 
                     login, tipo, obs, linhadig, coletor, formapag, valorpag
              FROM sis_lanc 
              WHERE login = '${safeLogin}' 
                AND datadel IS NULL
                AND status = 'pago'
              ORDER BY datapag DESC`,
        params: {}
      };
    },
    
    /**
     * Busca QRCode PIX por uuid_lanc (para gerar QRCode dinamicamente)
     */
    buscarQrPix: (uuidLanc) => {
      const safeUuid = (uuidLanc || '').replace(/['"\\]/g, '');
      return {
        sql: `SELECT titulo, qrcode
              FROM sis_qrpix 
              WHERE titulo = '${safeUuid}'
              LIMIT 1`,
        params: {}
      };
    },
    
    /**
     * Conta clientes ativos (total de clientes cadastrados ativos)
     */
    clientesAtivos: () => ({
      sql: `SELECT COUNT(*) as total 
            FROM sis_cliente 
            WHERE cli_ativado = 's'`,
      params: {}
    }),
    
    /**
     * Conta clientes online (radacct)
     */
    clientesOnline: () => ({
      sql: `SELECT COUNT(*) as total 
            FROM vtab_conectados`,
      params: {}
    }),
    
    /**
     * Lista clientes online com detalhes
     */
    listaClientesOnline: () => ({
      sql: `SELECT v.login, v.nome, c.celular, c.fone, c.email, c.plano
            FROM vtab_conectados v
            LEFT JOIN sis_cliente c ON v.login = c.login
            ORDER BY v.nome ASC
            LIMIT 5000`,
      params: {}
    }),
    
    /**
     * Busca cliente por login (alternativa para showLegacy)
     * Retorna TODOS os campos como buscarCliente
     */
    buscarClientePorLogin: (login) => {
      return {
        sql: `SELECT id, login, nome, cpf_cnpj, senha, plano, tipo, 
                     cli_ativado, bloqueado, observacao, rem_obs,
                     ip, mac, automac, equipamento, ssid,
                     endereco_res, numero_res, bairro_res, complemento_res, cep_res, cidade_res,
                     fone, celular, ramal, email,
                     coordenadas, caixa_herm, porta_olt, porta_splitter,
                     status_corte, cadastro, data_ins,
                     tit_abertos, tit_vencidos
              FROM sis_cliente 
              WHERE login = :login
              LIMIT 1`,
        params: { login }
      };
    },
    
    /**
     * Para uso em /request/form/:login
     */
    listarChamadosPorClienteId: (client_id) => {
      const safeClientId = parseInt(client_id) || 0;
      return {
        sql: `SELECT s.id, s.chamado, s.nome, s.login, s.status, s.prioridade, s.assunto, 
                     s.visita, s.atendente, s.login_atend, s.tecnico, s.abertura,
                     c.senha, c.plano, c.tipo, c.ip, c.endereco_res, c.numero_res, 
                     c.bairro_res, c.celular, f.nome as employee_name
              FROM sis_suporte s 
              LEFT JOIN sis_cliente c ON s.login = c.login 
              LEFT JOIN sis_func f ON s.tecnico = f.id
              WHERE c.id = ${safeClientId}
              ORDER BY s.abertura DESC
              LIMIT 10`,
        params: {}
      };
    },
    

    
    /**
     * Conta clientes bloqueados
     */
    clientesBloqueados: () => ({
      sql: `SELECT COUNT(*) as total 
            FROM sis_cliente 
            WHERE cli_ativado = 's' 
              AND (bloqueado = 'sim' OR bloqueado = 's')`,
      params: {}
    }),
    
    /**
     * Conta clientes em observação
     */
    clientesObservacao: () => ({
      sql: `SELECT COUNT(*) as total 
            FROM sis_cliente 
            WHERE cli_ativado = 's' 
              AND (observacao = 'sim' OR observacao = 's')`,
      params: {}
    }),
    
    /**
     * Conta clientes normais (não bloqueados e não em observação)
     */
    clientesNormais: () => ({
      sql: `SELECT COUNT(*) as total 
            FROM sis_cliente 
            WHERE cli_ativado = 's' 
              AND (bloqueado IS NULL OR bloqueado = '' OR bloqueado = 'nao' OR bloqueado = 'n')
              AND (observacao IS NULL OR observacao = '' OR observacao = 'nao' OR observacao = 'n')`,
      params: {}
    }),
    
    /**
     * Conta clientes offline (ativos mas não conectados)
     */
    clientesOffline: () => ({
      sql: `SELECT COUNT(*) as total 
            FROM sis_cliente c
            WHERE c.cli_ativado = 's'
              AND NOT EXISTS (
                SELECT 1 FROM vtab_conectados v 
                WHERE v.login = c.login
              )`,
      params: {}
    }),    

    /**
     * Clientes online (apenas logins) - usado para busca
     */
    loginsConectados: () => ({
      sql: `SELECT login FROM vtab_conectados`,
      params: {}
    }),
    /**
     * Consumo de dados por período (radacct)
     */
    consumoPorPeriodo: (login, dataInicio, dataFim) => ({
      sql: `SELECT username,
                   DATE(acctstarttime) as data,
                   SUM(acctinputoctets) as download,
                   SUM(acctoutputoctets) as upload,
                   SUM(acctinputoctets + acctoutputoctets) as total
            FROM radacct
            WHERE username = :login
              AND acctstarttime BETWEEN :inicio AND :fim
            GROUP BY username, DATE(acctstarttime)
            ORDER BY data ASC`,
      params: { login, inicio: dataInicio, fim: dataFim }
    }),

    /**
     * Consumo agregado em um período (total em bytes)
     */
    consumoAgregadoPeriodo: (login, dataInicio, dataFim) => {
      return {
        sql: `SELECT SUM(acctinputoctets + acctoutputoctets) as total
              FROM radacct
              WHERE username = :login
                AND acctstarttime BETWEEN :inicio AND :fim`,
        params: { login, inicio: dataInicio, fim: dataFim }
      };
    },
    
    /**
     * Consumo total do mês atual
     */
    consumoMesAtual: (login) => ({
      sql: `SELECT SUM(acctinputoctets + acctoutputoctets) as consumo_total
            FROM radacct
            WHERE username = :login
              AND acctstarttime >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
      params: { login }
    }),
    
    /**
     * Histórico de conexões recentes
     */
    historicoConexoes: (login, limite = 50) => ({
      sql: `SELECT radacctid,
                   acctstarttime, acctstoptime, 
                   framedipaddress, nasipaddress,
                   acctinputoctets, acctoutputoctets,
                   acctterminatecause
            FROM radacct
            WHERE username = :login
            ORDER BY acctstarttime DESC
            LIMIT :limite`,
      params: { login, limite },
      transform: (conn) => {
        // Transforma uma conexão individual do RADIUS para formato esperado pelo app
        // Parse de datas
        const startTime = conn.acctstarttime ? new Date(conn.acctstarttime) : null;
        const endTime = conn.acctstoptime ? new Date(conn.acctstoptime) : null;
        
        const startDate = startTime ? startTime.toLocaleDateString('pt-BR') : null;
        const startTimeStr = startTime ? startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
        const endDate = endTime ? endTime.toLocaleDateString('pt-BR') : null;
        const endTimeStr = endTime ? endTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
        
        // Calcula duração
        let duration = '0m';
        if (startTime) {
          const endTimeCalc = endTime || new Date();
          const durationMs = endTimeCalc - startTime;
          const durationSecs = Math.floor(durationMs / 1000);
          const days = Math.floor(durationSecs / 86400);
          const hours = Math.floor((durationSecs % 86400) / 3600);
          const minutes = Math.floor((durationSecs % 3600) / 60);
          
          if (days > 0) duration = `${days}d`;
          else if (hours > 0) duration = `${hours}h`;
          else duration = `${minutes}m`;
        }
        
        // Função para converter octets para formato legível (compatível com UserConnectionsController antigo)
        const formatOctets = (value) => {
          if (!value) return { new_value: 0, unit: 'Kb' };
          
          let bytes = parseFloat(value) || 0;
          let unitIndex = 0;
          const units = ['Kb', 'Mb', 'Gb'];
          
          // Converte de octetos para Kb primeiro
          bytes = bytes / 1024;
          
          while (bytes >= 1024 && unitIndex < units.length - 1) {
            bytes = bytes / 1024;
            unitIndex++;
          }
          
          return {
            new_value: parseFloat(bytes.toFixed(2)),
            unit: units[unitIndex]
          };
        };
        
        return {
          id: String(conn.radacctid || ''),
          start_date: startDate,
          start_time: startTimeStr,
          end_date: endDate,
          end_time: endTimeStr,
          duration,
          upload: formatOctets(conn.acctinputoctets),
          download: formatOctets(conn.acctoutputoctets)
        };
      }
    }),

    /**
     * Última conexão do cliente
     */
    ultimaConexao: (login) => {
      return {
        sql: `SELECT acctstarttime, acctstoptime
              FROM radacct
              WHERE username = :login
              ORDER BY acctstarttime DESC
              LIMIT 1`,
        params: { login }
      };
    },
    
    /**
     * Busca cliente por ID - Retorna campos compatíveis com backend-antigo
     * NOTA: Campos omitidos por causarem erro 500 no agente PHP: vencimento, dia_bloq
     * Todos os demais campos do model Client.js do backend-antigo estão incluídos
     */
    buscarCliente: (clientId) => {
      return {
        sql: `SELECT id, login, nome, cpf_cnpj, senha, plano, tipo, 
                     cli_ativado, bloqueado, observacao, rem_obs,
                     ip, mac, automac, equipamento, ssid,
                     endereco_res, numero_res, bairro_res, complemento_res, cep_res, cidade_res,
                     fone, celular, ramal, email,
                     coordenadas, caixa_herm, porta_olt, porta_splitter,
                     status_corte, cadastro, data_ins,
                     tit_abertos, tit_vencidos
              FROM sis_cliente
              WHERE id = ?
              LIMIT 1`,
        params: [clientId]
      };
    },
    
    /**
     * Histórico de conexões paginado
     */
    historicoConexoesPaginado: (login, page = 1, limit = 50) => {
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const safeLimit = Math.min(parseInt(limit), 100);
      
      return {
        sql: `SELECT radacctid as id,
                     DATE_FORMAT(acctstarttime, '%d/%m/%Y') as start_date,
                     DATE_FORMAT(acctstarttime, '%H:%i') as start_time,
                     DATE_FORMAT(acctstoptime, '%d/%m/%Y') as end_date,
                     DATE_FORMAT(acctstoptime, '%H:%i') as end_time,
                     CASE 
                       WHEN acctstoptime IS NULL THEN 
                         CONCAT(TIMESTAMPDIFF(DAY, acctstarttime, NOW()), 'd')
                       ELSE 
                         CONCAT(TIMESTAMPDIFF(DAY, acctstarttime, acctstoptime), 'd')
                     END as duration,
                     acctinputoctets,
                     acctoutputoctets
              FROM radacct
              WHERE username = :login
              ORDER BY acctstarttime DESC
              LIMIT :limit OFFSET :offset`,
        params: { login, limit: safeLimit, offset }
      };
    },
    
    /**
     * Busca CTOs próximas (caixas hermétcas)
     */
    ctoPorCoordenadas: (lat, lng, raio = 0.35) => ({
      sql: `SELECT id, nome, latitude, longitude,
                   (6371 * acos(
                     cos(radians(?)) * cos(radians(latitude)) *
                     cos(radians(longitude) - radians(?)) +
                     sin(radians(?)) * sin(radians(latitude))
                   )) AS distance
            FROM mp_caixa
            WHERE latitude IS NOT NULL 
              AND longitude IS NOT NULL
            HAVING distance < ?
            ORDER BY distance
            LIMIT 50`,
      params: [lat, lng, lat, raio]
    }),
    
    /**
     * Clientes conectados em uma CTO
     */
    clientesPorCto: (ctoid) => {
      return {
        sql: `SELECT id, login, nome, coordenadas, cpf_cnpj, celular, fone,
                     endereco_res, numero_res, bairro_res, plano, bloqueado, cli_ativado
              FROM sis_cliente
              WHERE caixa_herm = :ctoid
              ORDER BY nome ASC
              LIMIT 500`,
        params: { ctoid }
      };
    },
    
    /**
     * Busca plano do cliente
     */
    planoPorId: (planoId) => ({
      sql: `SELECT * FROM sis_plano WHERE id_plano = :planoId LIMIT 1`,
      params: { planoId }
    }),
    
    /**
     * Lista todos os planos ativos
     */
    planosAtivos: () => ({
      sql: `SELECT * FROM sis_plano WHERE ativo = 's' ORDER BY valor ASC`,
      params: {}
    }),
    
    /**
     * Verifica autenticação do cliente (radcheck)
     */
    verificaAutenticacao: (login) => ({
      sql: `SELECT * FROM radcheck WHERE username = :login`,
      params: { login }
    }),
    
    /**
     * Busca contratos do cliente
     */
    contratosPorCliente: (clienteId) => ({
      sql: `SELECT * FROM sis_cliente_contrato 
            WHERE cliente_id = :clienteId 
            ORDER BY data_inicio DESC`,
      params: { clienteId }
    }),
    
    /**
     * Busca cliente por CPF/CNPJ
     * NOTA: Campos omitidos por causarem erro 500: vencimento, dia_bloq
     */
    clientePorDocumento: (documento) => ({
      sql: `SELECT id, login, nome, cpf_cnpj, senha, plano, tipo, 
                   cli_ativado, bloqueado, observacao, rem_obs,
                   ip, mac, automac, equipamento, ssid,
                   endereco_res, numero_res, bairro_res, complemento_res, cep_res, cidade_res,
                   fone, celular, ramal, email,
                   coordenadas, caixa_herm, porta_olt, porta_splitter,
                   status_corte, cadastro, data_ins,
                   tit_abertos, tit_vencidos
            FROM sis_cliente 
            WHERE cpf_cnpj = :documento 
            LIMIT 1`,
      params: { documento }
    }),
    
    /**
     * Busca clientes por endereço (busca parcial)
     */
    clientesPorEndereco: (endereco) => ({
      sql: `SELECT id, login, nome, endereco_res, numero_res, bairro_res
            FROM sis_cliente 
            WHERE endereco_res LIKE :endereco
            LIMIT 100`,
      params: { endereco: `%${endereco}%` }
    }),
    
    /**
     * Dashboard - Estatísticas gerais
     */
    estatisticasGerais: () => ({
      sql: `SELECT 
              (SELECT COUNT(*) FROM sis_cliente WHERE cli_ativado = 's') as total_ativos,
              (SELECT COUNT(*) FROM sis_cliente WHERE bloqueado = 'sim') as total_bloqueados,
              (SELECT COUNT(*) FROM sis_lanc WHERE datadel IS NULL AND status = 'aberto') as titulos_abertos,
              (SELECT COUNT(*) FROM sis_lanc WHERE datadel IS NULL AND status IN ('aberto', 'vencido') AND datavenc < CURDATE()) as titulos_vencidos`,
      params: {}
    }),

    /**
     * Dashboard: OTIMIZADO - Todas as estatísticas de clientes em 1 query
     * Substitui: clientesAtivos, clientesOnline, clientesRecentes, clientesBloqueados, clientesObservacao
     * 
     * Clientes recentes = cadastrados no mês atual
     */
    dashboardClientesStats: () => ({
      sql: `SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN bloqueado = 's' OR bloqueado = 'sim' THEN 1 ELSE 0 END) as bloqueados,
              SUM(CASE WHEN observacao = 's' OR observacao = 'sim' THEN 1 ELSE 0 END) as observacao,
              SUM(CASE WHEN YEAR(data_ins) = YEAR(CURDATE()) AND MONTH(data_ins) = MONTH(CURDATE()) THEN 1 ELSE 0 END) as recentes,
              (SELECT COUNT(*) FROM vtab_conectados) as online
            FROM sis_cliente 
            WHERE cli_ativado = 's'`,
      params: {}
    }),

    /**
     * Dashboard: OTIMIZADO - Todas as estatísticas de faturas em 1 query
     * Substitui: dashboardFaturasPendentes, dashboardFaturasVencidas, dashboardTitulosClientes
     */
    dashboardInvoicesStats: () => ({
      sql: `SELECT
              SUM(CASE WHEN l.status IN ('aberto','vencido') AND l.datavenc >= CURDATE() AND l.datadel IS NULL THEN 1 ELSE 0 END) as pending,
              SUM(CASE WHEN l.status IN ('aberto','vencido') AND l.datavenc < CURDATE() AND l.datadel IS NULL THEN 1 ELSE 0 END) as overdue,
              (SELECT SUM(tit_abertos) FROM sis_cliente WHERE cli_ativado = 's') as tit_abertos,
              (SELECT SUM(tit_vencidos) FROM sis_cliente WHERE cli_ativado = 's') as tit_vencidos
            FROM sis_lanc l
            WHERE l.login IN (SELECT login FROM sis_cliente WHERE cli_ativado = 's')`,
      params: {}
    }),

    /**
     * Dashboard: OTIMIZADO - Todas as estatísticas de chamados em 1 query
     * Substitui: dashboardChamadosPorPrioridade, dashboardChamadosHoje, dashboardChamadosAtrasados, 
     *            dashboardChamadosEmAndamento, dashboardChamadosConcluidos
     */
    dashboardRequestsStats: () => ({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN prioridade = 'urgente' THEN 1 ELSE 0 END) as urgente,
              SUM(CASE WHEN prioridade = 'alta' THEN 1 ELSE 0 END) as alta,
              SUM(CASE WHEN prioridade = 'normal' THEN 1 ELSE 0 END) as normal,
              SUM(CASE WHEN prioridade = 'baixa' THEN 1 ELSE 0 END) as baixa,
              SUM(CASE WHEN DATE(visita) = CURDATE() THEN 1 ELSE 0 END) as today,
              SUM(CASE WHEN visita < CURDATE() AND status = 'aberto' THEN 1 ELSE 0 END) as overdue,
              SUM(CASE WHEN status NOT IN ('aberto','fechado','Fechado','FECHADO') THEN 1 ELSE 0 END) as ongoing,
              SUM(CASE WHEN status IN ('fechado','Fechado','FECHADO') THEN 1 ELSE 0 END) as completed
            FROM sis_suporte`,
      params: {}
    }),

    /**
     * Dashboard: faturas a vencer (DEPRECATED - use dashboardInvoicesStats)
     */
    dashboardFaturasPendentes: () => ({
      sql: `SELECT COUNT(*) as total
            FROM sis_lanc
            WHERE datadel IS NULL
              AND status IN ('aberto','vencido')
              AND datavenc >= CURDATE()
              AND login IN (SELECT login FROM sis_cliente WHERE cli_ativado = 's')`,
      params: {}
    }),

    /**
     * Dashboard: faturas vencidas (DEPRECATED - use dashboardInvoicesStats)
     */
    dashboardFaturasVencidas: () => ({
      sql: `SELECT COUNT(*) as total
            FROM sis_lanc
            WHERE datadel IS NULL
              AND status IN ('aberto','vencido')
              AND datavenc < CURDATE()
              AND login IN (SELECT login FROM sis_cliente WHERE cli_ativado = 's')`,
      params: {}
    }),

    /**
     * Dashboard: somatório de títulos dos clientes (DEPRECATED - use dashboardInvoicesStats)
     */
    dashboardTitulosClientes: () => ({
      sql: `SELECT SUM(tit_abertos) as tit_abertos, SUM(tit_vencidos) as tit_vencidos
            FROM sis_cliente
            WHERE cli_ativado = 's'`,
      params: {}
    }),

    /**
     * Dashboard: chamados por prioridade (DEPRECATED - use dashboardRequestsStats)
     */
    dashboardChamadosPorPrioridade: () => ({
      sql: `SELECT prioridade, COUNT(*) as total
            FROM sis_suporte
            WHERE status NOT IN ('Fechado','fechado','FECHADO')
            GROUP BY prioridade`,
      params: {}
    }),

    /**
     * Dashboard: chamados de hoje (DEPRECATED - use dashboardRequestsStats)
     */
    dashboardChamadosHoje: () => ({
      sql: `SELECT COUNT(*) as total
            FROM sis_suporte
            WHERE visita BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
      params: {}
    }),

    /**
     * Dashboard: chamados atrasados (DEPRECATED - use dashboardRequestsStats)
     */
    dashboardChamadosAtrasados: () => ({
      sql: `SELECT COUNT(*) as total
            FROM sis_suporte
            WHERE visita < CURDATE()
              AND status = 'aberto'`,
      params: {}
    }),

    /**
     * Dashboard: chamados em andamento (DEPRECATED - use dashboardRequestsStats)
     */
    dashboardChamadosEmAndamento: () => ({
      sql: `SELECT COUNT(*) as total
            FROM sis_suporte
            WHERE status NOT IN ('aberto','fechado','Fechado','FECHADO')`,
      params: {}
    }),

    /**
     * Dashboard: chamados concluídos (DEPRECATED - use dashboardRequestsStats)
     */
    dashboardChamadosConcluidos: () => ({
      sql: `SELECT COUNT(*) as total
            FROM sis_suporte
            WHERE status IN ('fechado','Fechado','FECHADO')`,
      params: {}
    }),
    
    // ==================== CHAMADOS/REQUESTS ====================
    
    /**
     * Lista chamados com filtros - baseado no backend antigo
     * NOTA: Query simplificada sem subquery COALESCE para evitar erro 401 do agente PHP
     * O backend buscará a mensagem separadamente se necessário
     */
    listarChamados: ({ date, login, tecnico, isAdmin, sortMode = 'DESC' } = {}) => {
      let sql = `SELECT s.id, s.chamado, s.nome, s.login, s.status, s.prioridade, s.assunto, s.visita, s.atendente, s.login_atend, s.tecnico, s.abertura, c.senha, c.plano, c.tipo, c.ip, c.endereco_res, c.numero_res, c.bairro_res, c.celular, f.nome as employee_name FROM sis_suporte s LEFT JOIN sis_cliente c ON s.login = c.login LEFT JOIN sis_func f ON s.tecnico = f.id`;
      
      const conditions = [];
      
      // Filtro por login do cliente (NOVO: para /requests/history)
      if (login) {
        const safeLogin = (login || '').replace(/['"\\]/g, '');
        conditions.push(`s.login = '${safeLogin}'`);
      }
      
      // Filtro por data de visita (backend-antigo filtra com Op.between na data fornecida)
      if (date) {
        const safeDate = (date || '').replace(/[^0-9-]/g, '');
        conditions.push(`DATE(s.visita) = '${safeDate}'`);
      }
      
      // Filtro por técnico (se não for admin)
      if (!isAdmin && tecnico) {
        const safeTecnico = parseInt(tecnico) || 0;
        conditions.push(`s.tecnico = ${safeTecnico}`);
      }
      
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      
      // ✅ Ordena por abertura DESC (mais recentes primeiro) ou ASC conforme sortMode
      const sortDirection = (sortMode || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      sql += ` ORDER BY s.abertura ${sortDirection} LIMIT 500`;
      
      return { sql, params: {} };
    },
    
    /**
     * Busca chamado por ID
     * Campos baseados no modelo SupportRequest.js do backend-antigo
     */
    chamadoPorId: (id) => ({
      sql: `SELECT id, tecnico, nome, login, status, assunto, visita, chamado, 
                   fechamento, motivo_fechar, prioridade, atendente, login_atend, 
                   abertura, email, uuid_suporte, ramal
            FROM sis_suporte WHERE id = :id LIMIT 1`,
      params: { id }
    }),
    
    /**
     * Estatísticas de chamados - baseado no backend antigo
     */
    estatisticasChamados: () => ({
      sql: `SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'aberto' THEN 1 ELSE 0 END) as abertos,
              SUM(CASE WHEN status NOT IN ('aberto', 'fechado', 'Fechado', 'FECHADO') THEN 1 ELSE 0 END) as em_andamento,
              SUM(CASE WHEN status IN ('fechado', 'Fechado', 'FECHADO') THEN 1 ELSE 0 END) as concluidos,
              SUM(CASE WHEN prioridade = 'urgente' THEN 1 ELSE 0 END) as urgentes,
              SUM(CASE WHEN prioridade = 'alta' THEN 1 ELSE 0 END) as alta,
              SUM(CASE WHEN prioridade = 'normal' THEN 1 ELSE 0 END) as normal,
              SUM(CASE WHEN prioridade = 'baixa' THEN 1 ELSE 0 END) as baixa
            FROM sis_suporte`,
      params: {}
    }),
    
    /**
     * Chamados em atraso - baseado no backend antigo
     */
    chamadosAtrasados: ({ sortMode = 'DESC' } = {}) => ({
      sql: `
        SELECT 
          s.*,
          c.login, c.senha, c.plano, c.tipo, c.ip,
          c.endereco_res, c.numero_res, c.bairro_res, c.celular,
          f.nome as employee_name,
          COALESCE((SELECT msg FROM sis_msg WHERE chamado = s.chamado ORDER BY msg_data DESC LIMIT 1), '') as ultima_mensagem
        FROM sis_suporte s
        LEFT JOIN sis_cliente c ON s.login = c.login
        LEFT JOIN sis_func f ON s.tecnico = f.id
        WHERE s.visita < CURDATE() 
          AND s.status = 'aberto'
        ORDER BY s.visita ${sortMode === 'DESC' ? 'DESC' : 'ASC'}
        LIMIT 200
      `,
      params: {}
    }),
    
    /**
     * Busca chamado completo com todas as mensagens e dados do cliente
     * Retorna formato compatível com backend-antigo
     */
    chamadoCompletoComMensagens: (requestId) => {
      return {
        sql: `SELECT @old_group_concat_max_len := @@group_concat_max_len, @group_concat_max_len := 1000000, s.id, s.chamado, s.visita, s.fechamento, s.motivo_fechar as motivo_fechamento, s.nome, s.login, s.tecnico, s.status, s.assunto, s.prioridade, c.id as client_id, c.senha, c.plano, c.tipo, c.ssid, c.ip, c.endereco_res as endereco, c.numero_res as numero, c.bairro_res as bairro, c.equipamento, c.coordenadas, c.observacao as observacoes, c.caixa_herm as caixa_hermetica, c.fone as telefone, c.celular, f.nome as employee_name, (SELECT IFNULL(CONCAT('[', GROUP_CONCAT(JSON_OBJECT('id', m.id, 'texto', m.msg, 'data', m.msg_data, 'timestamp', m.msg_data, 'atendente', m.atendente, 'tipo', COALESCE(m.tipo, 'tecnico')) ORDER BY m.msg_data ASC SEPARATOR ','), ']'), '[]') FROM sis_msg m WHERE m.chamado = s.chamado) as mensagens_json FROM sis_suporte s LEFT JOIN sis_cliente c ON s.login = c.login LEFT JOIN sis_func f ON s.tecnico = f.id WHERE s.id = :requestId LIMIT 1`,
        params: { requestId },
        transform: (rows) => {
          try {
            logger.debug('[chamadoCompletoComMensagens] Transform iniciado', {
              rows_count: rows?.length,
              row_keys: rows?.[0] ? Object.keys(rows[0]) : []
            });
            
            if (!rows || rows.length === 0) {
              logger.warn('[chamadoCompletoComMensagens] Nenhuma linha retornada');
              return [];
            }
            
            const row = rows[0];
            
            // Parse mensagens JSON
            let mensagens = [];
            try {
              if (row.mensagens_json) {
                logger.debug('[chamadoCompletoComMensagens] Parseando mensagens_json', {
                  json_type: typeof row.mensagens_json,
                  json_length: row.mensagens_json?.length
                });
                mensagens = JSON.parse(row.mensagens_json);
                logger.debug('[chamadoCompletoComMensagens] Mensagens parseadas', {
                  count: mensagens?.length
                });
              } else {
                logger.debug('[chamadoCompletoComMensagens] mensagens_json vazio');
              }
            } catch (e) {
              logger.error('[chamadoCompletoComMensagens] Erro ao parsear mensagens JSON', {
                error: e.message,
                json_value: row.mensagens_json?.substring(0, 200)
              });
            }
            
            // Parse coordenadas
            let latitude = null;
            let longitude = null;
            if (row.coordenadas) {
              try {
                const parts = row.coordenadas.split(',');
                if (parts.length === 2) {
                  latitude = parseFloat(parts[0].trim());
                  longitude = parseFloat(parts[1].trim());
                }
              } catch (e) {
                logger.error('[chamadoCompletoComMensagens] Erro ao parsear coordenadas', {
                  error: e.message,
                  coordenadas: row.coordenadas
                });
              }
            }
            
            // Formata datas
            let visitaTime = null;
            let dataVisita = null;
            
            try {
              const visitaDate = row.visita ? new Date(row.visita) : null;
              visitaTime = visitaDate ? visitaDate.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
              }) : null;
              
              dataVisita = visitaDate ? visitaDate.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              }) : null;
            } catch (e) {
              logger.error('[chamadoCompletoComMensagens] Erro ao formatar datas', {
                error: e.message,
                visita_value: row.visita
              });
            }
            
            // TODO: Gerar URL do mapa estático se latitude/longitude existirem
            const static_map_url = null;
            
            // ✅ ÚLTIMA NOTA: com ordenação ASC, a última posição é a mais recente
            const ultimaNota = mensagens && mensagens.length > 0 
              ? mensagens[mensagens.length - 1] 
              : null;
            
            const result = {
              id: row.id,
              client_id: row.client_id,
              chamado: row.chamado,
              visita: visitaTime,
              data_visita: dataVisita,
              nome: row.nome,
              fechamento: row.fechamento,
              motivo_fechamento: row.motivo_fechamento,
              login: row.login,
              senha: row.senha,
              plano: row.plano,
              tipo: row.tipo,
              ssid: row.ssid,
              ip: row.ip,
              status: row.status,
              assunto: row.assunto,
              endereco: row.endereco,
              numero: row.numero,
              bairro: row.bairro,
              equipamento: row.equipamento,
              coordenadas: row.coordenadas,
              mensagens: mensagens || [],
              ultima_nota: ultimaNota,  // ✅ NOVA PROPRIEDADE: última nota do array
              _mensagens_order: 'ASC',  // 📌 INDICADOR: mensagens em ordem ASC (mais antiga primeiro)
              observacoes: row.observacoes,
              caixa_hermetica: row.caixa_hermetica,
              employee_name: row.employee_name,
              latitude,
              longitude,
              static_map_url,
              telefone: row.telefone,
              celular: row.celular,
              prioridade: row.prioridade
            };
            
            logger.debug('[chamadoCompletoComMensagens] Transform concluído', {
              has_client_id: !!result.client_id,
              mensagens_count: result.mensagens.length
            });
            
            return [result];
            
          } catch (error) {
            logger.error('[chamadoCompletoComMensagens] Erro no transform', {
              error: error.message,
              stack: error.stack
            });
            throw error;
          }
        }
      };
    },
    
    // ==================== FUNCIONÁRIOS/EMPLOYEES ====================
    
    /**
     * Lista todos os funcionários
     */
    listarFuncionarios: () => ({
      sql: `SELECT id, nome, usuario, email, telefone, cargo, ativo, data_cadastro
            FROM sis_func 
            WHERE ativo = 's'
            ORDER BY nome ASC`,
      params: {}
    }),
    
    /**
     * Busca funcionário por ID
     */
    funcionarioPorId: (id) => ({
      sql: `SELECT * FROM sis_func WHERE id = :id LIMIT 1`,
      params: { id }
    }),
    
    /**
     * Lista técnicos ativos
     * NOTA: Apenas colunas que existem em sis_func: id, nome
     */
    listarTecnicos: () => ({
      sql: `SELECT id, nome
            FROM sis_func 
            ORDER BY nome ASC
            LIMIT 100`,
      params: {}
    }),
    
    /**
     * Lista assuntos de chamados
     * Busca da tabela item com campo = 'chamados_assunto'
     */
    /**
     * Busca assuntos de sis_opcao (configuração)
     */
    buscarAssuntosDeOpcao: () => ({
      sql: `SELECT valor FROM sis_opcao WHERE nome = 'assunto_suporte' LIMIT 1`,
      params: []
    }),
    
    /**
     * Busca assuntos DISTINCT de sis_suporte dos últimos 3 meses
     */
    buscarAssuntosDeSuporte: () => {
      // Data de 3 meses atrás
      const treseMesesAtras = new Date();
      treseMesesAtras.setMonth(treseMesesAtras.getMonth() - 3);
      const dataFormatada = treseMesesAtras.toISOString().split('T')[0]; // YYYY-MM-DD
      
      return {
        sql: `SELECT DISTINCT assunto FROM sis_suporte 
              WHERE assunto IS NOT NULL AND assunto != '' AND abertura >= ?
              ORDER BY assunto ASC`,
        params: [dataFormatada]
      };
    },
    
    listarAssuntos: () => ({
      sql: `SELECT uuid, nome FROM item WHERE campo = ?`,
      params: ['chamados_assunto']
    }),
    
    /**
     * Busca funcionário por usuário (login)
     */
    funcionarioPorUsuario: (usuario) => ({
      sql: `SELECT * FROM sis_func WHERE usuario = :usuario LIMIT 1`,
      params: { usuario }
    }),

    /**
     * Busca funcionário por email
     */
    funcionarioPorEmail: (email) => ({
      sql: `SELECT * FROM sis_func WHERE email = :email LIMIT 1`,
      params: { email }
    }),
    
    // ==================== MENSAGENS ====================
    
    /**
     * Lista mensagens entre cliente e provedor
     */
    listarMensagens: (clienteId, limit = 100) => ({
      sql: `SELECT * FROM mensagens 
            WHERE cliente_id = :clienteId 
            ORDER BY data_envio DESC
            LIMIT :limit`,
      params: { clienteId, limit }
    }),
    
    /**
     * Mensagens não lidas
     */
    mensagensNaoLidas: (clienteId) => ({
      sql: `SELECT COUNT(*) as total FROM mensagens 
            WHERE cliente_id = :clienteId 
              AND lida = 'n'`,
      params: { clienteId }
    }),
    
    // ==================== HISTÓRICO ====================
    
    /**
     * Histórico de chamados do cliente
     * Campos baseados no modelo SupportRequest.js do backend-antigo
     */
    historicoChamadosCliente: (clienteLogin, limit = 50) => ({
      sql: `SELECT id, tecnico, nome, login, status, assunto, visita, chamado, 
                   fechamento, motivo_fechar, prioridade, atendente, login_atend, 
                   abertura, email, uuid_suporte, ramal
            FROM sis_suporte 
            WHERE login = :clienteLogin 
            ORDER BY abertura DESC
            LIMIT :limit`,
      params: { clienteLogin, limit }
    }),
    
    /**
     * Histórico de alterações de chamado
     */
    historicoAlteracoes: (chamadoId) => ({
      sql: `SELECT * FROM chamado_historico 
            WHERE chamado_id = :chamadoId 
            ORDER BY data_alteracao DESC`,
      params: { chamadoId }
    }),
    
    // ==================== NOTIFICAÇÕES ====================
    
    /**
     * Notificações do funcionário
     */
    notificacoesFuncionario: (funcionarioId, limit = 50) => ({
      sql: `SELECT * FROM notificacoes 
            WHERE funcionario_id = :funcionarioId 
            ORDER BY data_criacao DESC
            LIMIT :limit`,
      params: { funcionarioId, limit }
    }),
    
    /**
     * Notificações não lidas
     */
    notificacoesNaoLidas: (funcionarioId) => ({
      sql: `SELECT COUNT(*) as total FROM notificacoes 
            WHERE funcionario_id = :funcionarioId 
              AND lida = 'n'`,
      params: { funcionarioId }
    }),
    
    // ==================== FATURAS/INVOICES ====================
    
    /**
     * Faturas do cliente por login
     */
    faturasPorCliente: (clienteLogin) => ({
      sql: `SELECT * FROM sis_lanc 
            WHERE login = :clienteLogin 
              AND datadel IS NULL
            ORDER BY datavenc DESC
            LIMIT 100`,
      params: { clienteLogin }
    }),
    
    /**
     * Busca fatura por ID
     * Campos baseados no modelo Invoice.js do backend-antigo
     */
    faturaPorId: (id) => ({
      sql: `SELECT id, uuid_lanc, datavenc, datapag, datadel, valor, status, 
                   login, tipo, obs, linhadig, coletor, formapag, valorpag
            FROM sis_lanc WHERE id = :id LIMIT 1`,
      params: { id }
    }),
    
    /**
     * Faturas em aberto do cliente
     * Campos baseados no modelo Invoice.js do backend-antigo
     */
    faturasAbertasCliente: (clienteLogin) => ({
      sql: `SELECT id, uuid_lanc, datavenc, datapag, datadel, valor, status, 
                   login, tipo, obs, linhadig, coletor, formapag, valorpag
            FROM sis_lanc 
            WHERE login = :clienteLogin 
              AND datadel IS NULL
              AND status IN ('aberto','vencido')
            ORDER BY datavenc ASC`,
      params: { clienteLogin }
    }),

    /**
     * Faturas pendentes (para contagem e próxima data)
     */
    faturasPendentesCliente: (clienteLogin) => ({
      sql: `SELECT id, datavenc, status
            FROM sis_lanc
            WHERE login = :clienteLogin
              AND datadel IS NULL
              AND status IN ('aberto','vencido')
            ORDER BY datavenc ASC`,
      params: { clienteLogin }
    }),
    
    // ==================== BUSCA ====================
    
    /**
     * Busca clientes por termo (nome, login, CPF, etc)
     */
    buscarClientes: (termo, limit = 100) => ({
      sql: `SELECT id, login, nome, cpf_cnpj, coordenadas,
                   endereco_res, numero_res, bairro_res, 
                   fone, celular, email, plano, tipo,
                   bloqueado, cli_ativado, observacao, caixa_herm, ssid
            FROM sis_cliente 
            WHERE nome LIKE :termo 
               OR login LIKE :termo 
               OR cpf_cnpj LIKE :termo
               OR endereco_res LIKE :termo
               OR fone LIKE :termo
               OR celular LIKE :termo
               OR email LIKE :termo
            LIMIT :limit`,
      params: { termo: `%${termo}%`, limit }
    }),

    /**
     * Busca clientes por nome (ativados/desativados)
     */
    buscarClientesPorNome: (termo, ativoFlag) => {
      return {
        sql: `SELECT id, nome, login, coordenadas, cpf_cnpj, celular, fone, email,
                     endereco_res, numero_res, bairro_res, plano, bloqueado
              FROM sis_cliente
              WHERE cli_ativado = :ativoFlag
                AND nome LIKE :termo
              ORDER BY nome ASC
              LIMIT 200`,
        params: { ativoFlag, termo: `%${termo}%` }
      };
    },

    /**
     * Busca clientes por CPF/CNPJ
     */
    buscarClientesPorDocumento: (termo, ativoFlag) => {
      return {
        sql: `SELECT id, nome, login, coordenadas, cpf_cnpj, celular, fone, email,
                     endereco_res, numero_res, bairro_res, plano, bloqueado
              FROM sis_cliente
              WHERE cli_ativado = :ativoFlag
                AND cpf_cnpj LIKE :termo
              ORDER BY nome ASC
              LIMIT 200`,
        params: { ativoFlag, termo: `%${termo}%` }
      };
    },

    /**
     * Busca clientes por caixa hermética
     */
    buscarClientesPorCaixa: (termo, ativoFlag) => {
      return {
        sql: `SELECT id, nome, login, coordenadas, cpf_cnpj, celular, fone, email,
                     endereco_res, numero_res, bairro_res, plano, bloqueado, caixa_herm
              FROM sis_cliente
              WHERE cli_ativado = :ativoFlag
                AND caixa_herm LIKE :termo
              ORDER BY nome ASC
              LIMIT 200`,
        params: { ativoFlag, termo: `%${termo}%` }
      };
    },

    /**
     * Busca clientes por SSID
     */
    buscarClientesPorSSID: (termo, ativoFlag) => {
      return {
        sql: `SELECT id, nome, login, coordenadas, cpf_cnpj, celular, fone, email,
                     endereco_res, numero_res, bairro_res, plano, bloqueado, ssid
              FROM sis_cliente
              WHERE cli_ativado = :ativoFlag
                AND ssid LIKE :termo
              ORDER BY nome ASC
              LIMIT 200`,
        params: { ativoFlag, termo: `%${termo}%` }
      };
    },
    
    /**
     * Busca cliente por telefone/celular
     * NOTA: Campos omitidos por causarem erro 500: vencimento, dia_bloq
     */
    buscarClientePorTelefone: (telefone) => ({
      sql: `SELECT id, login, nome, cpf_cnpj, senha, plano, tipo, 
                   cli_ativado, bloqueado, observacao, rem_obs,
                   ip, mac, automac, equipamento, ssid,
                   endereco_res, numero_res, bairro_res, complemento_res, cep_res, cidade_res,
                   fone, celular, ramal, email,
                   coordenadas, caixa_herm, porta_olt, porta_splitter,
                   status_corte, cadastro, data_ins,
                   tit_abertos, tit_vencidos
            FROM sis_cliente 
            WHERE fone = :telefone 
               OR celular = :telefone
            LIMIT 10`,
      params: { telefone }
    }),
    
    // ==================== CONEXÕES ====================
    
    /**
     * Última conexão do cliente
     */
    ultimaConexao: (login) => ({
      sql: `SELECT * FROM radacct 
            WHERE username = :login 
            ORDER BY acctstarttime DESC
            LIMIT 1`,
      params: { login }
    }),
    
    /**
     * Verifica se cliente está online
     */
    clienteOnline: (login) => ({
      sql: `SELECT * FROM vtab_conectados 
            WHERE login = :login
            LIMIT 1`,
      params: { login }
    }),

    /**
     * Consulta CTO por nome
     */
    ctoPorNome: (nome) => ({
      sql: `SELECT id FROM mp_caixa WHERE nome = :nome LIMIT 1`,
      params: { nome }
    }),

    /**
     * Busca chave Google Maps (sis_opcao)
     */
    googleMapsApiKey: () => ({
      sql: `SELECT valor FROM sis_opcao WHERE nome = 'key_googlemaps' LIMIT 1`,
      params: {}
    }),
    
    // ==================== ESTRUTURA DO APP ====================
    
    /**
     * Lista campos personalizados do formulário
     */
    camposFormulario: () => ({
      sql: `SELECT * FROM configuracao_formulario 
            WHERE ativo = 's' 
            ORDER BY ordem ASC`,
      params: {}
    }),
    
    /**
     * Configurações do sistema
     */
    configuracoesSistema: () => ({
      sql: `SELECT * FROM configuracoes LIMIT 100`,
      params: {}
    }),
  };

  /**
   * Normaliza rem_obs para manter apenas a data (YYYY-MM-DD)
   */
  static normalizeRemObs(remObs) {
    if (remObs === null || remObs === undefined) {
      return null;
    }

    const raw = String(remObs).trim();
    if (!raw) {
      return null;
    }

    const firstPart = raw.split(/[ T]/)[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(firstPart)) {
      return firstPart;
    }

    const parsed = new Date(raw);
    if (!isNaN(parsed)) {
      return parsed.toISOString().slice(0, 10);
    }

    return firstPart || null;
  }

  /**
   * Garante rem_obs normalizado em resultados de clientes
   */
  static normalizeClienteResult(result = {}) {
    if (!result || !result.data) {
      return result;
    }

    return {
      ...result,
      data: result.data.map(client => ({
        ...client,
        rem_obs: this.normalizeRemObs(client.rem_obs)
      }))
    };
  }
  
  /**
   * Executa uma query nomeada
   * 
   * @param {Object} tenant - Objeto do tenant/provedor
   * @param {String} queryName - Nome da query (chave do objeto queries)
   * @param {...any} args - Argumentos para a query
   * @returns {Promise<Object>} Resultado da query
   */
  static async execute(tenant, queryName, ...args) {
    const query = this.queries[queryName];
    
    if (!query) {
      throw new Error(`Query não encontrada: ${queryName}`);
    }
    
    const queryDef = query(...args);
    const { sql, params, transform } = queryDef;
    
    const result = await this.sendToAgent(tenant, sql, params);
    
    // Se a query tem função de transformação customizada, aplica
    if (transform && typeof transform === 'function') {
      const transformedData = transform(result.data);
      return transformedData;
    }
    
    // Retorna objeto completo com data, count, success
    return result;
  }

  /**
   * Busca cliente automaticamente detectando se é login ou ID
   * Tenta primeiro como login (CPF/CNPJ), depois como ID numérico
   * 
   * @param {Object} tenant - Objeto do tenant/provedor
   * @param {String|Number} identifier - Login (CPF/CNPJ) ou ID do cliente
   * @returns {Promise<Object>} Dados do cliente ou vazio
   */
  static async buscarClienteAuto(tenant, identifier) {
    const identifierStr = String(identifier).trim();
    
    console.log(`[buscarClienteAuto] Buscando: "${identifierStr}"`);
    
    // Tenta como login primeiro (CPF/CNPJ)
    try {
      const loginResult = await this.execute(tenant, 'buscarClientePorLogin', identifierStr);
      const normalizedLoginResult = this.normalizeClienteResult(loginResult);
      console.log(`[buscarClienteAuto] Tentou como login, encontrado: ${normalizedLoginResult?.data?.length || 0} registros`);
      if (normalizedLoginResult.data && normalizedLoginResult.data.length > 0) {
        return normalizedLoginResult;
      }
    } catch (err) {
      console.log(`[buscarClienteAuto] Erro ao tentar login: ${err.message}`);
    }
    
    // Tenta como ID (numérico)
    try {
      const numId = parseInt(identifierStr);
      console.log(`[buscarClienteAuto] Tentando como ID: ${numId}`);
      const idResult = await this.execute(tenant, 'buscarCliente', numId || identifierStr);
      const normalizedIdResult = this.normalizeClienteResult(idResult);
      console.log(`[buscarClienteAuto] Tentou como ID, encontrado: ${normalizedIdResult?.data?.length || 0} registros`);
      if (normalizedIdResult.data && normalizedIdResult.data.length > 0) {
        return normalizedIdResult;
      }
    } catch (err) {
      console.log(`[buscarClienteAuto] Erro ao tentar ID: ${err.message}`);
    }
    
    console.log(`[buscarClienteAuto] Nenhum resultado encontrado para "${identifierStr}"`);
    // Retorna resultado vazio se não encontrou
    return { data: [], success: true };
  }
  
  /**
   * Executa uma query SQL customizada (use com cuidado!)
   * 
   * @param {Object} tenant - Objeto do tenant/provedor
   * @param {String} sql - Query SQL
   * @param {Object} params - Parâmetros da query
   * @returns {Promise<Object>} Resultado da query
   */
  static async executeCustom(tenant, sql, params = {}) {
    return this.sendToAgent(tenant, sql, params);
  }
  
  /**
   * Envia requisição para o agente PHP
   * 
   * @param {Object} tenant - Objeto do tenant/provedor
   * @param {String} sql - Query SQL
   * @param {Object} params - Parâmetros da query
   * @returns {Promise<Object>} Resultado da query
   */
  static async sendToAgent(tenant, sql, params) {
    // Valida configuração do tenant
    if (!tenant.agente || !tenant.agente.url || !tenant.agente.token) {
      throw new Error('Agente não configurado para este provedor');
    }
    
    const { url, token } = tenant.agente;
    const timestamp = Date.now();
    const queryId = crypto.randomBytes(4).toString('hex'); // ID único para rastreamento
    const startTime = Date.now();
    
    // Log de início da query
    logger.debug('[MkAuthAgent] Query iniciada', {
      queryId,
      tenant: tenant.nome,
      sqlPreview: sql.substring(0, 100).replace(/\n/g, ' ') + (sql.length > 100 ? '...' : ''),
      paramsCount: Object.keys(params || {}).length
    });
    
    // Encripta SQL se chave de encriptação estiver configurada
    let sqlToSend = sql;
    const encryptionKey = tenant.agente.encryption_key || process.env.AGENT_ENCRYPTION_KEY;
    
    if (encryptionKey && tenant.agente.encrypt_queries) {
      sqlToSend = this.encryptQuery(sql, encryptionKey);
    }
    
    const payload = {
      action: 'execute_query',
      sql: sqlToSend,
      timestamp,
      encrypted: !!(encryptionKey && tenant.agente.encrypt_queries), // Flag para agente saber se está encriptado
      // Sempre incluir params (mesmo vazio) para alinhar a serialização JSON
      // com o agente PHP e evitar divergência na assinatura HMAC
      params: params && typeof params === 'object' ? params : {}
    };
    
    // Gera assinatura HMAC
    payload.signature = this.generateSignature(payload, token);
    
    try {
      const response = await axios.post(url, payload, {
        timeout: 15000, // 15 segundos
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MK-Edge-Backend/2.0'
        },
        validateStatus: (status) => status < 500 // Não lança erro em 4xx
      });
      
      const duration = Date.now() - startTime;
      
      // Log de sucesso
      logger.debug('[MkAuthAgent] Query completada com sucesso', {
        queryId,
        tenant: tenant.nome,
        status: response.status,
        duration: `${duration}ms`,
        resultCount: response.data?.count || response.data?.data?.length || 0
      });

      // Alguns agentes podem retornar string vazia em sucesso; normaliza para resposta vazia
      if (response.data === '') {
        const duration = Date.now() - startTime;
        logger.warn('[MkAuthAgent] Agente retornou resposta vazia', {
          queryId,
          tenant: tenant.nome,
          duration: `${duration}ms`,
          sqlPreview: sql.substring(0, 100)
        });
        return { success: true, data: [], count: 0 };
      }
      
      if (!response.data.success) {
        const duration = Date.now() - startTime;
        const agentError = response.data.error || 'Query falhou no agente';
        logger.error('[MkAuthAgent] Query falhou no agente', {
          queryId,
          tenant: tenant.nome,
          duration: `${duration}ms`,
          error: agentError,
          debug: response.data.debug,
          sqlPreview: sql.substring(0, 100)
        });
        
        throw new Error(agentError);
      }
      
      return response.data;
      
    } catch (error) {
      // Tratamento de erros específicos
      const duration = Date.now() - startTime;
      
      if (error.code === 'ECONNREFUSED') {
        logger.error('[MkAuthAgent] Agente inacessível (ECONNREFUSED)', {
          queryId,
          tenant: tenant.nome,
          duration: `${duration}ms`,
          url
        });
        throw new Error('Agente do provedor está offline');
      }
      
      if (error.code === 'ETIMEDOUT') {
        logger.error('[MkAuthAgent] Timeout ao comunicar com agente', {
          queryId,
          tenant: tenant.nome,
          duration: `${duration}ms`,
          timeout: '15s'
        });
        throw new Error('Timeout ao consultar dados do provedor');
      }
      
      logger.error('[MkAuthAgent] Erro ao chamar agente', {
        queryId,
        tenant: tenant.nome,
        duration: `${duration}ms`,
        error: error.message,
        code: error.code,
        sqlPreview: sql.substring(0, 100)
      });
      
      throw error;
    }
  }
  
  /**
   * Executa uma query definida em `MkAuthAgentService.queries`
   * Mantém compatibilidade com controllers que usam `executeQuery(queryObj)`
   * 
   * @param {Object} tenant - Objeto do tenant/provedor
   * @param {Object} queryObj - Objeto com `{ sql, params }`
   * @returns {Promise<Object>} Resultado normalizado do agente
   */
  static async executeQuery(tenant, queryObj) {
    if (!queryObj || !queryObj.sql) {
      throw new Error('Query inválida: objeto sem SQL');
    }
    const params = queryObj.params || {};
    return this.sendToAgent(tenant, queryObj.sql, params);
  }
  
  /**
   * Gera assinatura HMAC SHA256
   * 
   * @param {Object} payload - Dados a assinar
   * @param {String} secret - Token secreto
   * @returns {String} Assinatura HMAC
   */
  static generateSignature(payload, secret) {
    const { signature, ...data } = payload;
    
    // Ordenação recursiva de chaves para consistência exata com PHP
    const deepSort = (value) => {
      if (Array.isArray(value)) {
        return value.map((v) => deepSort(v));
      }
      if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const out = {};
        for (const k of keys) {
          out[k] = deepSort(value[k]);
        }
        return out;
      }
      return value;
    };

    const sortedData = deepSort(data);
    const jsonString = JSON.stringify(sortedData);
    const sig = crypto
      .createHmac('sha256', secret)
      .update(jsonString)
      .digest('hex');
    
    // Debug temporário
    if (process.env.DEBUG_SIGNATURE === 'true') {
      logger.debug('🔐 Signature debug', {
        sortedData,
        jsonString,
        signature: sig.substring(0, 16) + '...'
      });
    }
    
    return sig;
  }
  
  /**
   * Testa conexão com o agente (ping)
   * 
   * @param {Object} tenant - Objeto do tenant/provedor
   * @returns {Promise<Boolean>} true se agente está acessível
   */
  static async ping(tenant) {
    if (!tenant.agente || !tenant.agente.url || !tenant.agente.token) {
      return false;
    }
    
    const { url, token } = tenant.agente;
    const timestamp = Date.now();
    
    const payload = {
      action: 'ping',
      timestamp
    };
    
    payload.signature = this.generateSignature(payload, token);
    
    try {
      const response = await axios.post(url, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      return response.data.success === true;
      
    } catch (error) {
      logger.error('Ping ao agente falhou', {
        tenant: tenant.nome,
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Formata bytes para formato legível
   * Útil para dados do radacct
   * 
   * @param {Number} bytes - Bytes
   * @returns {String} Formato legível (ex: "1.5 GB")
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = MkAuthAgentService;
