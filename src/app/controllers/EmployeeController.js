/**
 * EmployeeController - Gerenciamento de Funcionários/Técnicos
 * 
 * Implementa a camada de controle para consulta de funcionários,
 * técnicos e colaboradores do provedor.
 * 
 * Utiliza MkAuthAgentService para consultar dados do MK-Auth via agente PHP.
 */

const MkAuthAgentService = require('../services/MkAuthAgentService');
const logger = require('../../logger');

class EmployeeController {
  /**
   * Lista todos os funcionários ativos
   * GET /employees
   */
  async index(req, res) {
    try {
      const { tenant } = req;
      
      // Verifica se tenant usa agente
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca funcionários via agente
      const funcionarios = await MkAuthAgentService.execute(
        tenant,
        'listarFuncionarios'
      );
      
      logger.info(`[EmployeeController] ${funcionarios.length} funcionários listados`, {
        provedor_id: tenant._id
      });
      
      return res.json(funcionarios);
      
    } catch (error) {
      logger.error('[EmployeeController] Erro ao listar funcionários', {
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar funcionários',
        message: error.message
      });
    }
  }
  
  /**
   * Busca funcionário específico
   * GET /employees/:id
   */
  async show(req, res) {
    try {
      const { tenant } = req;
      const { id } = req.params;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca funcionário via agente
      const funcionarios = await MkAuthAgentService.execute(
        tenant,
        'funcionarioPorId',
        id
      );
      
      if (!funcionarios || funcionarios.length === 0) {
        return res.status(404).json({
          error: 'Funcionário não encontrado'
        });
      }
      
      logger.info('[EmployeeController] Funcionário encontrado', {
        provedor_id: tenant._id,
        funcionario_id: id
      });
      
      return res.json(funcionarios[0]);
      
    } catch (error) {
      logger.error('[EmployeeController] Erro ao buscar funcionário', {
        error: error.message,
        funcionario_id: req.params.id
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar funcionário',
        message: error.message
      });
    }
  }
  
  /**
   * Lista apenas técnicos ativos
   * GET /employees/technicians
   */
  async technicians(req, res) {
    try {
      const { tenant } = req;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca técnicos via agente
      const tecnicos = await MkAuthAgentService.execute(
        tenant,
        'listarTecnicos'
      );
      
      logger.info(`[EmployeeController] ${tecnicos.length} técnicos listados`, {
        provedor_id: tenant._id
      });
      
      return res.json(tecnicos);
      
    } catch (error) {
      logger.error('[EmployeeController] Erro ao listar técnicos', {
        error: error.message
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar técnicos',
        message: error.message
      });
    }
  }
  
  /**
   * Busca funcionário por nome de usuário (login)
   * GET /employees/by-username/:username
   */
  async byUsername(req, res) {
    try {
      const { tenant } = req;
      const { username } = req.params;
      
      if (!tenant.usaAgente()) {
        return res.status(400).json({
          error: 'Provedor não configurado para usar agente MK-Auth'
        });
      }
      
      // Busca funcionário via agente
      const funcionarios = await MkAuthAgentService.execute(
        tenant,
        'funcionarioPorUsuario',
        username
      );
      
      if (!funcionarios || funcionarios.length === 0) {
        return res.status(404).json({
          error: 'Funcionário não encontrado'
        });
      }
      
      logger.info('[EmployeeController] Funcionário encontrado por username', {
        provedor_id: tenant._id,
        username
      });
      
      return res.json(funcionarios[0]);
      
    } catch (error) {
      logger.error('[EmployeeController] Erro ao buscar funcionário por username', {
        error: error.message,
        username: req.params.username
      });
      
      return res.status(500).json({
        error: 'Erro ao buscar funcionário',
        message: error.message
      });
    }
  }
}

module.exports = new EmployeeController();
