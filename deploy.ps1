#!/usr/bin/env pwsh

# Script de deploy - Atualiza código e certificados
# Preserva banco de dados e credenciais

param(
    [string]$Server = "root@172.31.255.4",
    [string]$RemotePath = "/root/mk-edge-api"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DEPLOY MK-EDGE API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Etapa 1: Sincronizar código
Write-Host "ETAPA 1: Sincronizando código..." -ForegroundColor Yellow
Write-Host ""

$essentialFiles = @(
    "package.json",
    "package-lock.json", 
    "Dockerfile",
    "docker-compose.yml",
    "docker-entrypoint.sh"
)

foreach ($file in $essentialFiles) {
    if (Test-Path $file) {
        Write-Host "Copiando $file..."
        scp $file "$Server`:$RemotePath/"
    }
}

# Copia diretório src
Write-Host "Copiando src/..."
scp -r src "$Server`:$RemotePath/"

Write-Host ""
Write-Host "ETAPA 2: Copiando certificados..." -ForegroundColor Yellow
Write-Host ""

# Copia certificados
if (Test-Path "certificates/efi-homologacao.p12") {
    scp certificates/efi-homologacao.p12 certificates/efi-producao.p12 "$Server`:$RemotePath/certificates/"
    Write-Host "✅ Certificados copiados" -ForegroundColor Green
}

Write-Host ""
Write-Host "ETAPA 3: Executando deploy no servidor remoto..." -ForegroundColor Yellow
Write-Host ""

ssh "$Server" @"
cd $RemotePath

echo "Parando containers..."
docker-compose down

echo "Copiando certificados para volume..."
docker volume create mk-edge-api_certificates 2>/dev/null || true
docker run --rm -v mk-edge-api_certificates:/certs -v `$(pwd)/certificates:/source alpine sh -c "cp /source/*.p12 /certs/ 2>/dev/null || true"

echo "Rebuilding imagem..."
docker-compose build --no-cache

echo "Subindo containers..."
docker-compose up -d

echo "Aguardando API iniciar..."
sleep 8

docker logs mk-edge-api --tail 20
"@

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "DEPLOY CONCLUIDO!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "✅ Código e certificados atualizados" -ForegroundColor Green
Write-Host "✅ Banco de dados preservado (credenciais mantidas)" -ForegroundColor Green
Write-Host ""
Write-Host "Acesse: http://172.31.255.4" -ForegroundColor Cyan
