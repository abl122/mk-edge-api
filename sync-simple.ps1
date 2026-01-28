# Sincronização simples do banco de dados via SSH
# Execute este script no PowerShell

$SERVER = "root@172.31.255.4"
$DB = "mkedgetenants"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Sincronização MongoDB Local -> Remoto" -ForegroundColor Cyan  
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Exportar dados locais
Write-Host "[1/4] Exportando dados locais...`n" -ForegroundColor Yellow

mongoexport --db=$DB --collection=tenants --out=tenants.json --jsonArray
mongoexport --db=$DB --collection=plans --out=plans.json --jsonArray
mongoexport --db=$DB --collection=users --out=users.json --jsonArray
mongoexport --db=$DB --collection=invoices --out=invoices.json --jsonArray 2>$null
mongoexport --db=$DB --collection=integrations --out=integrations.json --jsonArray 2>$null

Write-Host "✅ Exportação concluída`n" -ForegroundColor Green

# 2. Copiar para servidor
Write-Host "[2/4] Copiando arquivos para servidor...`n" -ForegroundColor Yellow

scp tenants.json plans.json users.json $SERVER:/tmp/
scp invoices.json integrations.json $SERVER:/tmp/ 2>$null

Write-Host "✅ Arquivos copiados`n" -ForegroundColor Green

# 3. Importar no servidor
Write-Host "[3/4] Importando no servidor remoto...`n" -ForegroundColor Yellow

ssh $SERVER bash -c @"
docker cp /tmp/tenants.json mk-edge-mongo:/tmp/
docker cp /tmp/plans.json mk-edge-mongo:/tmp/  
docker cp /tmp/users.json mk-edge-mongo:/tmp/
docker cp /tmp/invoices.json mk-edge-mongo:/tmp/ 2>/dev/null
docker cp /tmp/integrations.json mk-edge-mongo:/tmp/ 2>/dev/null

docker exec mk-edge-mongo mongoimport --db=$DB --collection=tenants --file=/tmp/tenants.json --jsonArray --mode=upsert --upsertFields=_id
docker exec mk-edge-mongo mongoimport --db=$DB --collection=plans --file=/tmp/plans.json --jsonArray --mode=upsert --upsertFields=_id
docker exec mk-edge-mongo mongoimport --db=$DB --collection=users --file=/tmp/users.json --jsonArray --mode=upsert --upsertFields=_id
docker exec mk-edge-mongo mongoimport --db=$DB --collection=invoices --file=/tmp/invoices.json --jsonArray --mode=upsert --upsertFields=_id 2>/dev/null
docker exec mk-edge-mongo mongoimport --db=$DB --collection=integrations --file=/tmp/integrations.json --jsonArray --mode=upsert --upsertFields=_id 2>/dev/null

echo ''
echo 'Contagem após importação:'
docker exec mk-edge-mongo mongosh $DB --quiet --eval 'print(\"Tenants: \" + db.tenants.countDocuments()); print(\"Plans: \" + db.plans.countDocuments()); print(\"Users: \" + db.users.countDocuments());'
"@

Write-Host "`n✅ Importação concluída`n" -ForegroundColor Green

# 4. Limpar
Write-Host "[4/4] Limpando arquivos temporários...`n" -ForegroundColor Yellow

Remove-Item tenants.json, plans.json, users.json, invoices.json, integrations.json -ErrorAction SilentlyContinue

Write-Host "✅ SINCRONIZAÇÃO COMPLETA!`n" -ForegroundColor Green
Write-Host "Próximos passos:" -ForegroundColor Cyan
Write-Host "  ssh $SERVER" -ForegroundColor White  
Write-Host "  pm2 restart mk-edge-api`n" -ForegroundColor White
