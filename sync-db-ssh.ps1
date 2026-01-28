# Script para sincronizar banco de dados via SSH
# Sincroniza: Tenants, Plans, Invoices, Integrations

$SERVER_IP = "172.31.255.4"
$SERVER_USER = "root"
$MONGO_CONTAINER = "mk-edge-mongo"
$DB_NAME = "mkedgetenants"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🔄 SINCRONIZAÇÃO COMPLETA: Local → Remoto" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$collections = @("tenants", "plans", "invoices", "users", "integrations")
$exportedFiles = @()

# 1. Exportar dados locais
Write-Host "📦 Exportando dados do MongoDB local...`n" -ForegroundColor Yellow

foreach ($collection in $collections) {
    $filename = "$collection-export.json"
    Write-Host "   Exportando $collection..." -ForegroundColor Gray
    
    $result = mongoexport --db=$DB_NAME --collection=$collection --out=$filename --jsonArray 2>&1
    
    if (Test-Path $filename) {
        $lines = (Get-Content $filename | Measure-Object -Line).Lines
        Write-Host "   ✅ $collection : $lines documentos" -ForegroundColor Green
        $exportedFiles += $filename
    } else {
        Write-Host "   ⚠️  $collection : não encontrado (pode não existir ainda)" -ForegroundColor Yellow
    }
}

if ($exportedFiles.Count -eq 0) {
    Write-Host "`n❌ Nenhum dado foi exportado!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Exportação concluída: $($exportedFiles.Count) collections`n" -ForegroundColor Green

# 2. Copiar arquivos para servidor
Write-Host "📤 Copiando dados para o servidor...`n" -ForegroundColor Yellow

foreach ($file in $exportedFiles) {
    Write-Host "   Enviando $file..." -ForegroundColor Gray
    scp $file ${SERVER_USER}@${SERVER_IP}:/tmp/
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ $file copiado" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Erro ao copiar $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n✅ Arquivos copiados para o servidor`n" -ForegroundColor Green

# 3. Fazer backup e importar no servidor
Write-Host "`n📥 Importando dados no servidor remoto...`n" -ForegroundColor Yellow

$bashScript = @'
#!/bin/bash
echo "🔄 Fazendo backup dos dados atuais..."
BACKUP_DIR=/tmp/backup-$(date +%Y%m%d-%H%M%S)
mkdir -p $BACKUP_DIR

# Backup de cada collection
docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=tenants --out=/tmp/tenants-backup.json --jsonArray 2>/dev/null
docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=plans --out=/tmp/plans-backup.json --jsonArray 2>/dev/null
docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=invoices --out=/tmp/invoices-backup.json --jsonArray 2>/dev/null
docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=users --out=/tmp/users-backup.json --jsonArray 2>/dev/null
docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=integrations --out=/tmp/integrations-backup.json --jsonArray 2>/dev/null

echo ''
echo "📊 Dados ANTES da importação:"
docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval "print('Tenants: ' + db.tenants.countDocuments()); print('Plans: ' + db.plans.countDocuments()); print('Users: ' + db.users.countDocuments());"

echo ''
echo "📥 Importando novos dados..."

# Importar cada collection
for collection in tenants plans invoices users integrations; do
  if [ -f /tmp/${collection}-export.json ]; then
    echo "   Importando $collection..."
    docker cp /tmp/${collection}-export.json mk-edge-mongo:/tmp/
    docker exec mk-edge-mongo mongoimport --db=mkedgetenants --collection=$collection --file=/tmp/${collection}-export.json --jsonArray --mode=upsert --upsertFields=_id 2>&1 | grep -v "^$"
    echo "   ✅ $collection importado"
  fi
done

echo ''
echo "📊 Dados DEPOIS da importação:"
docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval "print('Tenants: ' + db.tenants.countDocuments()); print('Plans: ' + db.plans.countDocuments()); print('Users: ' + db.users.countDocuments());"

echo ''
echo "✨ Importação concluída!"
'@

# Salvar script bash temporário
$bashScript | Out-File -FilePath "sync-remote.sh" -Encoding ASCII

# Enviar script para servidor
scp sync-remote.sh ${SERVER_USER}@${SERVER_IP}:/tmp/
ssh ${SERVER_USER}@${SERVER_IP} "chmod +x /tmp/sync-remote.sh && /tmp/sync-remote.sh"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO!`n" -ForegroundColor Green
} else {
    Write-Host "`n❌ Erro durante a sincronização no servidor!`n" -ForegroundColor Red
    exit 1
}

# 4. Limpar arquivos locais
Write-Host "🧹 Limpando arquivos temporários...`n" -ForegroundColor Gray
foreach ($file in $exportedFiles) {
    Remove-Item $file -ErrorAction SilentlyContinue
}

Write-Host "✅ Sincronização completa finalizada!`n" -ForegroundColor Green
Write-Host "📋 Próximos passos:" -ForegroundColor Cyan
Write-Host "   1. Reinicie a API no servidor: pm2 restart mk-edge-api" -ForegroundColor White
Write-Host "   2. Verifique os logs: pm2 logs mk-edge-api" -ForegroundColor White
Write-Host "   3. Teste o login no sistema`n" -ForegroundColor White
