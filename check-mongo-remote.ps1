# Script PowerShell para verificar MongoDB no servidor 172.31.255.2
# Execute: .\check-mongo-remote.ps1

$server = "172.31.255.2"
$user = "root"
$password = "F@lcon2931"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🔍 Verificando MongoDB em $server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Cria arquivo de comandos temporário
$commandsFile = "I:\Projetos\MK-EDGE\mk-edge-api\temp-remote-commands.sh"
@"
#!/bin/bash
echo ""
echo "📦 Containers Docker:"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'

echo ""
echo "🔍 Procurando container MongoDB..."
MONGO_CONTAINER=`$(docker ps --format '{{.Names}}' | grep -i mongo | head -n1)

if [ -z "`$MONGO_CONTAINER" ]; then
    echo "❌ Container MongoDB não encontrado!"
    exit 1
fi

echo "✅ Container encontrado: `$MONGO_CONTAINER"

echo ""
echo "📊 Bancos de dados:"
docker exec `$MONGO_CONTAINER mongosh --quiet --eval "db.adminCommand('listDatabases').databases.forEach(d => print('- ' + d.name))"

echo ""
echo "📊 Verificando mkedgetenants:"
docker exec `$MONGO_CONTAINER mongosh mkedgetenants --quiet --eval "
print('');
print('=== Collections ===');
db.getCollectionNames().forEach(c => {
    print('- ' + c + ': ' + db[c].countDocuments() + ' docs');
});

print('');
print('=== USUÁRIOS ===');
const total = db.users.countDocuments();
print('Total: ' + total);

if (total > 0) {
    print('Com email: ' + db.users.countDocuments({email: {\\`$exists: true}}));
    print('Com celular: ' + db.users.countDocuments({celular: {\\`$exists: true}}));
    print('Admin: ' + db.users.countDocuments({roles: 'admin'}));
    print('Portal: ' + db.users.countDocuments({roles: 'portal'}));
    print('');
    print('=== Lista ===');
    db.users.find({}, {nome:1, email:1, celular:1, login:1, roles:1}).forEach(u => {
        print('');
        print('👤 ' + u.nome + ' (' + u.login + ')');
        print('   Email: ' + (u.email || '❌'));
        print('   Celular: ' + (u.celular || '❌'));
        print('   Roles: ' + JSON.stringify(u.roles));
    });
}
"
"@ | Out-File -FilePath $commandsFile -Encoding ASCII

Write-Host "📤 Copiando script para o servidor..." -ForegroundColor Yellow

# Usa SCP com senha (requer interação manual)
Write-Host "Digite a senha quando solicitado: $password" -ForegroundColor Green
scp $commandsFile ${user}@${server}:/tmp/check-mongo.sh

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Script copiado!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Executando script no servidor..." -ForegroundColor Yellow
    Write-Host "Digite a senha novamente: $password" -ForegroundColor Green
    ssh ${user}@${server} "bash /tmp/check-mongo.sh"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Verificação concluída!" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Erro ao copiar script" -ForegroundColor Red
}

# Limpeza
Remove-Item $commandsFile -Force -ErrorAction SilentlyContinue

Write-Host ""
