#!/usr/bin/env powershell
# Script para fazer push no GitHub com Token Pessoal

Write-Host "`n🚀 PUSH PARA GITHUB COM TOKEN`n" -ForegroundColor Cyan

# Perguntar pelo token
Write-Host "Cole seu Personal Access Token (será mascarado):" -ForegroundColor Yellow
$token = Read-Host -AsSecureString

# Converter de SecureString para plain text
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($token)
$tokenPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($ptr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($ptr)

# Configurar remote com token
Write-Host "`n🔐 Configurando autenticação..." -ForegroundColor Green
cd "i:\Projetos\API Backend-Mk-Edge2\servidor"
git remote set-url origin https://abl122:$tokenPlain@github.com/abl122/novo-backend-agente-mk-edge2.git

# Fazer push
Write-Host "📤 Fazendo push...`n" -ForegroundColor Green
git push -u origin main

# Limpar remote (remover token da URL visível)
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ PUSH REALIZADO COM SUCESSO!`n" -ForegroundColor Green
    git remote set-url origin https://github.com/abl122/novo-backend-agente-mk-edge2.git
    Write-Host "🔒 Remote reconfigurado sem token (segurança)`n"
    Write-Host "Acesse: https://github.com/abl122/novo-backend-agente-mk-edge2`n"
} else {
    Write-Host "`n❌ Erro no push. Verifique o token e a URL do repositório.`n" -ForegroundColor Red
    git remote set-url origin https://github.com/abl122/novo-backend-agente-mk-edge2.git
}
