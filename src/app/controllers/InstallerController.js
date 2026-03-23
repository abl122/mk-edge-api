/**
 * InstallerController
 * Gera instalador personalizado para cada cliente
 */

const logger = require('../../logger');
const Tenant = require('../schemas/Tenant');

class InstallerController {
  /**
   * GET /api/installer/script/:tenantId
   * Retorna instalador.sh personalizado para o tenant
   */
  static async getPersonalizedScript(req, res) {
    try {
      const { tenantId } = req.params;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID é obrigatório'
        });
      }

      const tenant = await Tenant.findById(tenantId).lean();
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'Tenant não encontrado'
        });
      }

      const tokenAgente = tenant?.agente?.token || req.query.token;
      if (!tokenAgente) {
        return res.status(400).json({
          success: false,
          message: 'Token do agente não configurado para este tenant'
        });
      }

      const tenantData = {
        tenant_id: tenantId,
        token_agente: tokenAgente,
        email: req.query.email || tenant?.provedor?.email || 'admin@tenant.com',
        domain: req.query.domain || tenant?.provedor?.dominio || ''
      };

      // Gerar script personalizado
      const script = this.generateInstallerScript(tenantData);

      // Retornar como arquivo para download
      res.setHeader('Content-Type', 'text/x-shellscript');
      res.setHeader('Content-Disposition', `attachment; filename="mk-edge-installer-${tenantId}.sh"`);
      res.send(script);
    } catch (error) {
      logger.error('Erro ao gerar installer:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar instalador'
      });
    }
  }

  /**
   * Gerar script personalizado do instalador
   */
  static generateInstallerScript(tenantData) {
    const { tenant_id, token_agente, email } = tenantData;
    const installerBaseUrl = (process.env.INSTALLER_BASE_URL || process.env.PUBLIC_URL || 'https://mk-edge.com.br').replace(/\/$/, '');

    return `#!/bin/bash

####################################################################
#                                                                  #
#  MK-EDGE INSTALLER - Script de Instalação do Agente            #
#  Personalizado para: ${email}                              
#  Tenant ID: ${tenant_id}                   
#  Data: $(date '+%Y-%m-%d %H:%M:%S')
#                                                                  #
####################################################################

set -e

# Cores para output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

# Configurações
INSTALL_DIR="/opt/mk-auth/admin/addons/mk-edge"
BACKUP_DIR="/opt/mk-auth/admin/addons/mk-edge.backup.$(date +%s)"
API_URL="${installerBaseUrl}"
API_AGENT_URL="${installerBaseUrl}/mk-edge/api.php"
TENANT_ID="${tenant_id}"
TOKEN_AGENTE="${token_agente}"
EMAIL="${email}"

# Log
LOG_FILE="/var/log/mk-edge-installer.log"

# Funções
log() {
  echo -e "\${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]\${NC} \$1" | tee -a \$LOG_FILE
}

success() {
  echo -e "\${GREEN}✅ \$1\${NC}" | tee -a \$LOG_FILE
}

error() {
  echo -e "\${RED}❌ \$1\${NC}" | tee -a \$LOG_FILE
}

warning() {
  echo -e "\${YELLOW}⚠️  \$1\${NC}" | tee -a \$LOG_FILE
}

# Verificar se é root
if [ "\$EUID" -ne 0 ]; then 
  error "Este script deve ser executado como root (use sudo)"
  exit 1
fi

clear
echo -e "\${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║       🚀 MK-EDGE - INSTALADOR AUTOMÁTICO                      ║"
echo "║                                                                ║"
echo "║       Tenant: \${TENANT_ID}                   ║"
echo "║       Email: \${EMAIL}                    ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "\${NC}"

log "Iniciando instalação do MK-Edge Agente..."
log "Tenant ID: \$TENANT_ID"
log "Email: \$EMAIL"
log "API URL: \$API_URL"
log "Agent Source URL: \$API_AGENT_URL"

# Passo 1: Criar diretório
log "Passo 1: Criando diretório de instalação..."

if [ -d "\$INSTALL_DIR" ]; then
  warning "Diretório \$INSTALL_DIR já existe. Fazendo backup..."
  mkdir -p \$BACKUP_DIR
  cp -r \$INSTALL_DIR/* \$BACKUP_DIR/
  success "Backup criado em: \$BACKUP_DIR"
else
  mkdir -p \$INSTALL_DIR
  success "Diretório criado: \$INSTALL_DIR"
fi

# Passo 2: Download dos arquivos
log "Passo 2: Baixando arquivos do agente..."

# Download api.php
curl -fsSL --connect-timeout 10 --max-time 30 -o "\$INSTALL_DIR/api.php" "\$API_AGENT_URL" || {
  error "Falha ao baixar api.php"
  exit 1
}

if [ ! -s "\$INSTALL_DIR/api.php" ]; then
  error "api.php foi baixado vazio"
  exit 1
fi

success "api.php baixado"

# Download config.php (vai gerar personalizado)
log "Gerando config.php personalizado..."

cat > "\$INSTALL_DIR/config.php" << 'CONFEOF'
<?php
/**
 * CONFIGURAÇÃO DO AGENTE MK-EDGE
 * PERSONALIZADO PARA CADA CLIENTE
 */

// Tenant ID
define('MKEDGE_TENANT_ID', '${tenant_id}');

// Token do Agente (CRÍTICO - Manter seguro)
define('MKEDGE_API_TOKEN', '${token_agente}');

// URL da API MK-Edge
define('MKEDGE_API_URL', '${installerBaseUrl}/api');

// Email do Tenant
define('MKEDGE_EMAIL', '${email}');

// IPs autorizados
define('ALLOWED_IPS', '*');

// Banco de dados MK-Auth
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'mkradius');
define('DB_USER', 'root');
define('DB_PASS', 'vertrigo');
define('DB_CHARSET', 'latin1');

// Segurança
define('REQUIRE_HTTPS', false);
define('RATE_LIMIT_ENABLED', false);
define('DEBUG', true);

// Tabelas permitidas
define('ALLOWED_TABLES', 'sis_cliente,sis_cliente_contrato,radcheck,radacct,radreply,radgroupreply,radusergroup,title,sis_lanc,sis_boleto,sis_qrpix,sis_suporte,sis_solic,sis_plano,mp_caixa,olt,pon,edge_notifications,connected_users');

// Limite de resultados
define('MAX_QUERY_RESULTS', 1000);

// Log
define('LOG_FILE', __DIR__ . '/logs/agent.log');

// Criar diretório de logs se não existir
if (!is_dir(__DIR__ . '/logs')) {
  mkdir(__DIR__ . '/logs', 0755, true);
}
?>
CONFEOF

success "config.php personalizado criado"

# Passo 3: Definir permissões
log "Passo 3: Definindo permissões..."

chmod 755 "\$INSTALL_DIR/api.php"
chmod 600 "\$INSTALL_DIR/config.php"  # Restritivo para config com token
mkdir -p "\$INSTALL_DIR/logs"
chmod 755 "\$INSTALL_DIR/logs"

success "Permissões definidas"

# Passo 4: Testar conexão com API
log "Passo 4: Testando conexão com API MK-Edge..."

HEALTH_CHECK=\$(curl -fsS --connect-timeout 5 --max-time 10 "\$API_URL/health" | grep -q "ok" && echo "ok" || echo "fail")

if [ "\$HEALTH_CHECK" = "ok" ]; then
  success "API MK-Edge está respondendo"
else
  warning "API MK-Edge não respondeu. Verifique conectividade"
fi

# Passo 5: Verificar dependencies
log "Passo 5: Verificando dependências..."

if ! command -v php &> /dev/null; then
  error "PHP não encontrado. Instale PHP 7.4+ antes de continuar"
  exit 1
fi

PHP_VERSION=\$(php -r 'echo phpversion();')
success "PHP \$PHP_VERSION encontrado"

# Passo 6: Criar serviço (opcional)
log "Passo 6: Configurando serviço (opcional)..."

warning "Configure seu servidor web para servir os arquivos em \$INSTALL_DIR"
warning "Exemplo Nginx:"
warning "  location /mk-edge/ {"
warning "    root /opt/mk-auth/admin/addons;"
warning "    try_files \\\$uri \\\$uri/ /mk-edge/api.php?\\\$query_string;"
warning "    fastcgi_pass unix:/run/php/php7.4-fpm.sock;"
warning "  }"

# Resumo
clear
echo -e "\${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║        ✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO!                   ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "\${NC}"

echo -e "\${BLUE}📋 INFORMAÇÕES DE INSTALAÇÃO:\${NC}"
echo "  Diretório: \$INSTALL_DIR"
echo "  Tenant ID: \$TENANT_ID"
echo "  Email: \$EMAIL"
echo "  API URL: \$API_URL"
echo "  Log: \$LOG_FILE"
echo ""

echo -e "\${BLUE}🔐 CREDENCIAIS DO AGENTE:\${NC}"
echo "  Token: \${TOKEN_AGENTE:0:32}...\${TOKEN_AGENTE: -16}"
echo ""

echo -e "\${BLUE}📖 PRÓXIMOS PASSOS:\${NC}"
echo "  1. Configurar servidor web (Nginx/Apache)"
echo "  2. Testar acesso: curl http://localhost/mk-edge/api.php"
echo "  3. Verificar logs: tail -f \$LOG_FILE"
echo "  4. Ativar no portal: ${installerBaseUrl}/portal.html"
echo ""

echo -e "\${YELLOW}⚠️  IMPORTANTE:\${NC}"
echo "  • Mantenha config.php seguro (contém token sensível)"
echo "  • Não compartilhe o token com terceiros"
echo "  • Faça backup regular dos arquivos"
echo "  • Verifique logs periodicamente"
echo ""

success "Instalação finalizada em: \$(date '+%Y-%m-%d %H:%M:%S')"

exit 0
`;
  }

  /**
   * POST /api/installer/download/:tenantId
   * Fazer download do instalador personalizado
   */
  static async downloadInstaller(req, res) {
    try {
      const { tenantId } = req.params;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID é obrigatório'
        });
      }

      const tenant = await Tenant.findById(tenantId).lean();
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'Tenant não encontrado'
        });
      }

      const tokenAgente = tenant?.agente?.token || req.query.token;
      if (!tokenAgente) {
        return res.status(400).json({
          success: false,
          message: 'Token do agente não configurado para este tenant'
        });
      }

      const tenantData = {
        tenant_id: tenantId,
        token_agente: tokenAgente,
        email: req.query.email || tenant?.provedor?.email || 'admin@tenant.com',
        domain: req.query.domain || tenant?.provedor?.dominio || ''
      };

      const script = this.generateInstallerScript(tenantData);

      res.setHeader('Content-Type', 'text/x-shellscript');
      res.setHeader('Content-Disposition', `attachment; filename="mk-edge-installer-${tenantId}.sh"`);
      res.send(script);
    } catch (error) {
      logger.error('Erro ao gerar download:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar instalador'
      });
    }
  }
}

module.exports = InstallerController;
