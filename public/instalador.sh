#!/bin/bash

################################################################################
# MK-Edge Installer - Script de Instalação do Agente
# 
# USO:
#   curl -s https://updata.com.br/mk-edge/installer.sh | bash -s TENANT_ID EMAIL
#
# DESCRIÇÃO:
#   - Faz download de api.php e config.php
#   - Coloca em /opt/mk-auth/admin/addons/mk-edge/
#   - Configura permissões
#   - Valida instalação
################################################################################

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
TENANT_ID="${1:-}"
EMAIL="${2:-}"
INSTALL_DIR="/opt/mk-auth/admin/addons/mk-edge"
API_URL="https://updata.com.br/mk-edge"
LOG_FILE="/var/log/mk-edge-installer.log"

################################################################################
# FUNÇÕES
################################################################################

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║            MK-Edge Agent Installer                         ║${NC}"
    echo -e "${BLUE}║            Version 1.0.0                                    ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_output() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_requirements() {
    echo -e "\n${BLUE}[1/5]${NC} Verificando requisitos do sistema..."
    
    # Verificar privilégios root
    if [ "$EUID" -ne 0 ]; then
        print_error "Este script deve ser executado como root (use sudo)"
        exit 1
    fi
    print_success "Privilégios de root verificados"
    
    # Verificar curl
    if ! command -v curl &> /dev/null; then
        print_error "curl não está instalado"
        exit 1
    fi
    print_success "curl encontrado"
    
    # Verificar PHP
    if ! command -v php &> /dev/null; then
        print_error "PHP não está instalado"
        exit 1
    fi
    PHP_VERSION=$(php -r 'echo phpversion();')
    print_success "PHP $PHP_VERSION encontrado"
    
    # Verificar se o diretório pai existe
    if [ ! -d "/opt/mk-auth" ]; then
        print_warning "Diretório /opt/mk-auth não existe. Criando..."
        mkdir -p "/opt/mk-auth/admin/addons"
    fi
}

validate_inputs() {
    echo -e "\n${BLUE}[2/5]${NC} Validando dados de entrada..."
    
    if [ -z "$TENANT_ID" ]; then
        print_error "TENANT_ID não fornecido"
        echo "Uso: curl -s installer.sh | bash -s TENANT_ID EMAIL"
        exit 1
    fi
    print_success "TENANT_ID validado: $TENANT_ID"
    
    if [ -z "$EMAIL" ]; then
        print_error "EMAIL não fornecido"
        echo "Uso: curl -s installer.sh | bash -s TENANT_ID EMAIL"
        exit 1
    fi
    print_success "EMAIL validado: $EMAIL"
}

create_directories() {
    echo -e "\n${BLUE}[3/5]${NC} Criando diretórios..."
    
    if [ ! -d "$INSTALL_DIR" ]; then
        mkdir -p "$INSTALL_DIR"
        print_success "Diretório criado: $INSTALL_DIR"
    else
        print_info "Diretório já existe: $INSTALL_DIR"
    fi
}

download_files() {
    echo -e "\n${BLUE}[4/5]${NC} Fazendo download dos arquivos..."
    
    # Download api.php
    echo -e "\nBaixando ${BLUE}api.php${NC}..."
    if curl -f -o "$INSTALL_DIR/api.php" "$API_URL/api.php"; then
        print_success "api.php baixado com sucesso"
    else
        print_error "Falha ao baixar api.php"
        exit 1
    fi
    
    # Download config.php
    echo -e "\nBaixando ${BLUE}config.php${NC}..."
    if curl -f -o "$INSTALL_DIR/config.php" "$API_URL/config.php"; then
        print_success "config.php baixado com sucesso"
    else
        print_error "Falha ao baixar config.php"
        exit 1
    fi
    
    # Download .htaccess
    echo -e "\nBaixando ${BLUE}.htaccess${NC}..."
    if curl -f -o "$INSTALL_DIR/.htaccess" "$API_URL/.htaccess"; then
        print_success ".htaccess baixado com sucesso"
    else
        print_warning "Falha ao baixar .htaccess (opcional)"
    fi
}

configure_files() {
    echo -e "\n${BLUE}[5/5]${NC} Configurando arquivos..."
    
    # Criar config.json com dados do tenant
    cat > "$INSTALL_DIR/config.json" << EOF
{
  "tenant_id": "$TENANT_ID",
  "email": "$EMAIL",
  "api_url": "https://api.mkedge.com.br",
  "version": "1.0.0",
  "installed_at": "$(date -Iseconds)",
  "status": "active"
}
EOF
    print_success "config.json criado com sucesso"
    
    # Configurar permissões
    chmod 755 "$INSTALL_DIR"
    chmod 644 "$INSTALL_DIR"/*.php
    chmod 644 "$INSTALL_DIR/config.json"
    
    # Se executável web, permitir leitura/escrita
    if [ -d "$INSTALL_DIR/../" ]; then
        chmod 755 "$INSTALL_DIR/../"
    fi
    
    print_success "Permissões configuradas"
}

verify_installation() {
    echo -e "\n${BLUE}Verificando Instalação${NC}..."
    
    if [ -f "$INSTALL_DIR/api.php" ]; then
        print_success "api.php encontrado"
    else
        print_error "api.php não encontrado"
        exit 1
    fi
    
    if [ -f "$INSTALL_DIR/config.php" ]; then
        print_success "config.php encontrado"
    else
        print_error "config.php não encontrado"
        exit 1
    fi
    
    if [ -f "$INSTALL_DIR/config.json" ]; then
        print_success "config.json encontrado"
    else
        print_error "config.json não encontrado"
        exit 1
    fi
    
    # Tentar executar php api.php -v para verificar sintaxe
    if php -l "$INSTALL_DIR/api.php" > /dev/null 2>&1; then
        print_success "Sintaxe PHP válida em api.php"
    else
        print_warning "Possível erro de sintaxe em api.php"
    fi
}

print_summary() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            ✓ Instalação Concluída com Sucesso!              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${BLUE}📁 Diretório de Instalação:${NC}"
    echo "   $INSTALL_DIR"
    echo ""
    
    echo -e "${BLUE}📄 Arquivos Instalados:${NC}"
    echo "   ✓ api.php"
    echo "   ✓ config.php"
    echo "   ✓ config.json"
    echo "   ✓ .htaccess"
    echo ""
    
    echo -e "${BLUE}🔧 Próximos Passos:${NC}"
    echo "   1. Acessar o portal: https://mkedge.com.br/portal"
    echo "   2. Login com seu email: $EMAIL"
    echo "   3. Verificar status do agente no painel"
    echo "   4. Consultar documentação: https://docs.mkedge.com.br"
    echo ""
    
    echo -e "${BLUE}📋 Informações:${NC}"
    echo "   Tenant ID: $TENANT_ID"
    echo "   Email: $EMAIL"
    echo "   Data: $(date)"
    echo "   Log: $LOG_FILE"
    echo ""
    
    echo -e "${YELLOW}⚠️  Importante:${NC}"
    echo "   - Guarde seu Tenant ID com segurança"
    echo "   - Não compartilhe suas credenciais"
    echo "   - Para desinstalar, execute: rm -rf $INSTALL_DIR"
    echo ""
}

handle_error() {
    echo ""
    print_error "Instalação falhou no passo anterior!"
    echo ""
    echo -e "${YELLOW}Verifique os seguintes pontos:${NC}"
    echo "   1. Você tem privilégios de root? (use sudo)"
    echo "   2. Sua conexão com internet está ativa?"
    echo "   3. O servidor está acessível?"
    echo "   4. PHP está instalado? (php -v)"
    echo "   5. curl está disponível? (curl --version)"
    echo ""
    echo "Log: $LOG_FILE"
    echo ""
    exit 1
}

trap handle_error ERR

################################################################################
# EXECUÇÃO PRINCIPAL
################################################################################

print_header

# Executar passos
check_requirements
validate_inputs
create_directories
download_files
configure_files
verify_installation
print_summary

# Log final
log_output "Instalação concluída com sucesso para tenant $TENANT_ID"

exit 0
