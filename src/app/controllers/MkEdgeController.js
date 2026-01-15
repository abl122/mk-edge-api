/**
 * Controlador para Servir Arquivos do MK-Edge
 * 
 * Este controlador gerencia o download dos arquivos:
 * - installer.sh
 * - api.php
 * - config.php
 * - .htaccess
 * 
 * Adicione a rota abaixo em routes.js:
 * router.get('/mk-edge/:file', MkEdgeController.download);
 */

const fs = require('fs');
const path = require('path');

class MkEdgeController {
  /**
   * Download de arquivos do MK-Edge
   * GET /mk-edge/:file
   * 
   * Exemplo:
   * - /mk-edge/installer.sh
   * - /mk-edge/api.php
   * - /mk-edge/config.php
   * - /mk-edge/.htaccess
   */
  static download(req, res) {
    const file = req.params.file;
    
    // Lista de arquivos permitidos para download
    const allowedFiles = [
      'installer.sh',
      'api.php',
      'config.php',
      '.htaccess'
    ];
    
    // Validar nome do arquivo
    if (!allowedFiles.includes(file)) {
      return res.status(404).json({
        success: false,
        message: 'Arquivo não encontrado',
        available_files: allowedFiles
      });
    }
    
    // Caminho seguro do arquivo
    const filePath = path.join(__dirname, '../public', file);
    
    // Prevenir directory traversal
    const normalizedPath = path.normalize(filePath);
    const publicDir = path.normalize(path.join(__dirname, '../public'));
    
    if (!normalizedPath.startsWith(publicDir)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }
    
    // Verificar se arquivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Arquivo não encontrado no servidor',
        file: file
      });
    }
    
    try {
      // Definir headers
      const contentType = getContentType(file);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Stream arquivo
      const fileStream = fs.createReadStream(filePath);
      
      fileStream.on('error', (err) => {
        console.error(`Erro ao servir arquivo ${file}:`, err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Erro ao servir arquivo'
          });
        }
      });
      
      fileStream.pipe(res);
      
      // Log
      console.log(`[MK-Edge] Download: ${file} para ${req.ip}`);
      
    } catch (err) {
      console.error('Erro:', err);
      res.status(500).json({
        success: false,
        message: 'Erro ao servir arquivo',
        error: err.message
      });
    }
  }
  
  /**
   * Info sobre arquivos disponíveis
   * GET /mk-edge/info
   */
  static info(req, res) {
    const files = {
      'installer.sh': {
        description: 'Script de instalação automatizada do agente MK-Edge',
        type: 'bash',
        usage: 'curl -s https://updata.com.br/mk-edge/installer.sh | bash -s TENANT_ID EMAIL',
        size_kb: 'Verificar',
        version: '1.0.0'
      },
      'api.php': {
        description: 'API REST principal do agente MK-Edge',
        type: 'php',
        endpoints: [
          'GET /health',
          'GET /status',
          'POST /webhook',
          'POST /messages',
          'PUT /config',
          'GET /logs'
        ],
        version: '1.0.0'
      },
      'config.php': {
        description: 'Arquivo de configuração do agente',
        type: 'php',
        note: 'Carregado automaticamente por api.php'
      },
      '.htaccess': {
        description: 'Configuração de rewrite rules do Apache',
        type: 'apache',
        note: 'Redireciona requisições para api.php'
      }
    };
    
    res.json({
      success: true,
      agent: 'MK-Edge',
      version: '1.0.0',
      files: files,
      download_url: 'https://updata.com.br/mk-edge/:file'
    });
  }
  
  /**
   * Status do servidor MK-Edge
   * GET /mk-edge/status
   */
  static status(req, res) {
    res.json({
      success: true,
      message: 'MK-Edge Server Status',
      status: 'operational',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        installer: 'available',
        api_download: 'available',
        config_download: 'available'
      }
    });
  }
}

/**
 * Determina o Content-Type baseado na extensão
 */
function getContentType(filename) {
  const types = {
    '.sh': 'application/x-bash',
    '.php': 'application/x-php',
    '.htaccess': 'text/plain'
  };
  
  const ext = path.extname(filename);
  return types[ext] || 'application/octet-stream';
}

module.exports = MkEdgeController;

/**
 * ADICIONAR ESTAS ROTAS EM routes.js:
 * 
 * const MkEdgeController = require('./app/controllers/MkEdgeController');
 * 
 * // Servir arquivos do MK-Edge
 * router.get('/mk-edge/:file', MkEdgeController.download);
 * router.get('/mk-edge/info', MkEdgeController.info);
 * router.get('/mk-edge/status', MkEdgeController.status);
 * 
 * URLs Resultantes:
 * - GET https://api.mkedge.com.br/mk-edge/installer.sh
 * - GET https://api.mkedge.com.br/mk-edge/api.php
 * - GET https://api.mkedge.com.br/mk-edge/config.php
 * - GET https://api.mkedge.com.br/mk-edge/.htaccess
 * - GET https://api.mkedge.com.br/mk-edge/info
 * - GET https://api.mkedge.com.br/mk-edge/status
 */
