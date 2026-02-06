/**
 * SQL Queries Constantes - MkAuthAgent
 * 
 * Centraliza todas as queries SQL para facilitar:
 * - Manutenção e debugging
 * - Versionamento e auditorias
 * - Reutilização entre métodos
 * 
 * @version 1.0.0
 */

const SQL_QUERIES = {
  // ==================== CLIENTE ====================
  
  CLIENTE_POR_LOGIN: {
    template: `SELECT id, login, nome, cpf_cnpj, senha, plano, tipo, 
                     cli_ativado, bloqueado, observacao, rem_obs,
                     ip, mac, automac, equipamento, ssid,
                     endereco_res, numero_res, bairro_res, complemento_res, cep_res, cidade_res,
                     fone, celular, ramal, email,
                     coordenadas, caixa_herm, porta_olt, porta_splitter,
                     status_corte, cadastro, data_ins,
                     tit_abertos, tit_vencidos
              FROM sis_cliente WHERE login = :login LIMIT 1`,
    description: 'Busca cliente por login - NOTA: Campos omitidos por causarem erro 500: vencimento, dia_bloq'
  },

  CLIENTE_COMPLETO: {
    template: `SELECT id, login, nome, cpf_cnpj, senha, plano, tipo, 
                     cli_ativado, bloqueado, observacao, rem_obs,
                     ip, mac, automac, equipamento, ssid,
                     endereco_res, numero_res, bairro_res, complemento_res, cep_res, cidade_res,
                     fone, celular, ramal, email,
                     coordenadas, caixa_herm, porta_olt, porta_splitter,
                     status_corte, cadastro, data_ins,
                     tit_abertos, tit_vencidos
              FROM sis_cliente WHERE login = :login LIMIT 1`,
    description: 'Busca cliente completo'
  },

  CLIENTES_ONLINE: {
    template: `SELECT login, nome FROM sis_cliente WHERE cli_ativado = 's' AND bloqueado = 'nao' AND login IN (SELECT DISTINCT login FROM sis_autenticacoes WHERE logout IS NULL)`,
    description: 'Lista clientes que estão online (sem logout)'
  },

  CLIENTES_OFFLINE: {
    template: `SELECT id, login, nome, email, fone, celular FROM sis_cliente 
               WHERE cli_ativado = 's' AND login NOT IN (SELECT DISTINCT login FROM sis_autenticacoes WHERE logout IS NULL)
               LIMIT 100`,
    description: 'Lista clientes offline'
  },

  CLIENTES_BLOQUEADOS: {
    template: `SELECT id, login, nome, email, fone FROM sis_cliente WHERE bloqueado = 'sim' LIMIT 100`,
    description: 'Lista clientes bloqueados'
  },

  CLIENTES_OBSERVACAO: {
    template: `SELECT id, login, nome, observacao, rem_obs FROM sis_cliente WHERE observacao != 'nao' AND observacao IS NOT NULL LIMIT 100`,
    description: 'Lista clientes em observação'
  },

  // ==================== CHAMADOS ====================

  CHAMADO_COMPLETO_COM_MENSAGENS: {
    template: `SELECT @old_group_concat_max_len := @@group_concat_max_len, @group_concat_max_len := 1000000, s.id, s.chamado, s.visita, s.fechamento, s.motivo_fechar as motivo_fechamento, s.nome, s.login, s.tecnico, s.status, s.assunto, s.prioridade, c.id as client_id, c.senha, c.plano, c.tipo, c.ssid, c.ip, c.endereco_res as endereco, c.numero_res as numero, c.bairro_res as bairro, c.equipamento, c.coordenadas, c.observacao as observacoes, c.caixa_herm as caixa_hermetica, c.fone as telefone, c.celular, f.nome as employee_name, (SELECT IFNULL(CONCAT('[', GROUP_CONCAT(JSON_OBJECT('id', m.id, 'texto', m.msg, 'data', m.msg_data, 'timestamp', m.msg_data, 'atendente', m.atendente, 'tipo', COALESCE(m.tipo, 'tecnico')) ORDER BY m.msg_data DESC SEPARATOR ','), ']'), '[]') FROM sis_msg m WHERE m.chamado = s.chamado) as mensagens_json FROM sis_suporte s LEFT JOIN sis_cliente c ON s.login = c.login LEFT JOIN sis_func f ON s.tecnico = f.id WHERE s.id = :requestId LIMIT 1`,
    description: 'Busca chamado completo com todas as mensagens (query CRÍTICA)'
  },

  LISTAR_CHAMADOS: {
    template: `SELECT s.id, s.chamado, s.visita, s.data_abertura, s.data_visita, s.fechamento, 
                     s.nome, s.login, s.tecnico, s.status, s.assunto, s.prioridade 
              FROM sis_suporte s 
              WHERE s.data_visita = :date 
              {{#if login}} AND s.login = :login {{/if}}
              {{#if tecnico}} AND (s.tecnico = :tecnico OR s.tecnico IS NULL OR s.tecnico = 0) {{/if}}
              {{#if isAdmin === false}} AND (s.tecnico = :tecnico OR s.tecnico IS NULL OR s.tecnico = 0) {{/if}}
              ORDER BY s.visita {{sortMode}}`,
    description: 'Lista chamados com filtros (data, técnico, admin)'
  },

  CHAMADOS_ATRASADOS: {
    template: `SELECT s.id, s.chamado, s.visita, s.data_abertura, s.data_visita, s.nome, 
                     s.login, s.tecnico, s.status, s.assunto, s.prioridade 
              FROM sis_suporte s 
              WHERE s.status = 'aberto' AND s.data_visita < CURDATE() 
              ORDER BY s.data_visita {{sortMode}}`,
    description: 'Chamados em atraso (não fechados e data < hoje)'
  },

  CHAMADOS_HOJE: {
    template: `SELECT id, chamado, visita, data_visita, nome, status, assunto, prioridade 
               FROM sis_suporte 
               WHERE data_visita = CURDATE() 
               ORDER BY visita`,
    description: 'Chamados agendados para hoje'
  },

  // ==================== ESTATÍSTICAS ====================

  ESTATISTICAS_GERAIS: {
    template: `SELECT 
                 COUNT(DISTINCT c.id) as total_clientes,
                 SUM(CASE WHEN c.bloqueado = 'sim' THEN 1 ELSE 0 END) as clientes_bloqueados,
                 SUM(CASE WHEN c.observacao != 'nao' THEN 1 ELSE 0 END) as clientes_observacao,
                 COUNT(DISTINCT s.id) as total_chamados,
                 SUM(CASE WHEN s.status = 'aberto' THEN 1 ELSE 0 END) as chamados_abertos,
                 SUM(CASE WHEN s.status = 'fechado' THEN 1 ELSE 0 END) as chamados_fechados
               FROM sis_cliente c 
               LEFT JOIN sis_suporte s ON c.login = s.login`,
    description: 'Estatísticas gerais do provedor'
  },

  DASHBOARD_CLIENTES_STATS: {
    template: `SELECT 
                 COUNT(*) as total,
                 SUM(CASE WHEN cli_ativado = 's' AND bloqueado = 'nao' THEN 1 ELSE 0 END) as normal,
                 SUM(CASE WHEN bloqueado = 'sim' THEN 1 ELSE 0 END) as blocked,
                 SUM(CASE WHEN observacao != 'nao' THEN 1 ELSE 0 END) as observation,
                 SUM(CASE WHEN data_ins >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as recent
               FROM sis_cliente`,
    description: 'Estatísticas de clientes para dashboard'
  },

  DASHBOARD_CHAMADOS_STATS: {
    template: `SELECT 
                 COUNT(*) as total,
                 SUM(CASE WHEN status = 'aberto' THEN 1 ELSE 0 END) as ongoing,
                 SUM(CASE WHEN status = 'fechado' THEN 1 ELSE 0 END) as completed,
                 SUM(CASE WHEN status = 'aberto' AND data_visita < CURDATE() THEN 1 ELSE 0 END) as overdue,
                 SUM(CASE WHEN data_visita = CURDATE() THEN 1 ELSE 0 END) as today
               FROM sis_suporte`,
    description: 'Estatísticas de chamados para dashboard'
  }
};

module.exports = SQL_QUERIES;
