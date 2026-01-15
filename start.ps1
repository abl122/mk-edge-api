# Script para iniciar o servidor
Write-Host "Iniciando servidor Nova API MK-Edge..." -ForegroundColor Green
Write-Host ""

# Ir para o diretório do script
Set-Location -Path $PSScriptRoot

# Verificar se node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  node_modules não encontrado. Instalando dependências..." -ForegroundColor Yellow
    npm install
}

# Variáveis de ambiente (carregadas do arquivo .env)
# Não defina aqui - configure no arquivo .env

# Iniciar o servidor
Write-Host "🚀 Iniciando servidor..." -ForegroundColor Cyan
node src\server.js
