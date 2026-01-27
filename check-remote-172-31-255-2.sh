#!/bin/bash

##############################################################################
# Script para verificar MongoDB no servidor 172.31.255.2
##############################################################################

SERVER="172.31.255.2"

echo ""
echo "========================================"
echo "🔍 Verificando servidor $SERVER"
echo "========================================"
echo ""

echo "📦 Containers Docker:"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

echo ""
echo "🔍 Procurando container MongoDB..."
if docker ps | grep -q mongo; then
    MONGO_CONTAINER=$(docker ps --format "{{.Names}}" | grep mongo | head -n1)
    echo "✅ Container MongoDB encontrado: $MONGO_CONTAINER"
    
    echo ""
    echo "📊 Verificando banco de dados..."
    docker exec $MONGO_CONTAINER mongosh --quiet --eval "
        print('');
        print('=== Bancos de Dados ===');
        db.adminCommand('listDatabases').databases.forEach(function(d) {
            print('- ' + d.name);
        });
    "
    
    echo ""
    echo "📊 Verificando banco mkedgetenants..."
    docker exec $MONGO_CONTAINER mongosh mkedgetenants --quiet --eval "
        print('');
        print('=== Collections ===');
        db.getCollectionNames().forEach(function(c) {
            const count = db[c].countDocuments();
            print('- ' + c + ': ' + count + ' documentos');
        });
        
        print('');
        print('=== USUÁRIOS ===');
        const totalUsers = db.users.countDocuments();
        print('Total: ' + totalUsers);
        print('');
        
        if (totalUsers > 0) {
            print('Com email: ' + db.users.countDocuments({email: {\$exists: true}}));
            print('Com celular: ' + db.users.countDocuments({celular: {\$exists: true}}));
            print('Admin: ' + db.users.countDocuments({roles: 'admin'}));
            print('Portal: ' + db.users.countDocuments({roles: 'portal'}));
            print('');
            
            print('=== Lista de Usuários ===');
            db.users.find({}, {nome:1, email:1, celular:1, login:1, roles:1}).forEach(function(u) {
                print('');
                print('👤 ' + u.nome + ' (' + u.login + ')');
                print('   Email: ' + (u.email || '❌ FALTANDO'));
                print('   Celular: ' + (u.celular || '❌ FALTANDO'));
                print('   Roles: ' + JSON.stringify(u.roles));
            });
        }
    "
else
    echo "❌ Nenhum container MongoDB encontrado!"
    echo ""
    echo "Containers em execução:"
    docker ps --format "{{.Names}}"
fi

echo ""
echo "✅ Verificação concluída"
echo ""
