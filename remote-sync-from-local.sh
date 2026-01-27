#!/bin/bash

##############################################################################
# Script para sincronizar usuários do MongoDB local para o remoto
# Execute este script NA SUA MÁQUINA LOCAL (não no servidor)
##############################################################################

SERVER_IP="172.31.255.4"
SERVER_USER="root"  # Ajuste se necessário

echo ""
echo "========================================"
echo "🔄 SINCRONIZAÇÃO MongoDB: Local → Remoto"
echo "========================================"
echo ""

# Exporta dados do MongoDB local
echo "📦 Exportando dados do MongoDB local..."
mongoexport --db=mkedgetenants --collection=users --out=users-local-export.json --jsonArray

if [ ! -f "users-local-export.json" ]; then
    echo "❌ Erro ao exportar dados locais!"
    exit 1
fi

echo "✅ Dados locais exportados: $(wc -l < users-local-export.json) linhas"
echo ""

# Copia arquivo para o servidor
echo "📤 Copiando dados para o servidor $SERVER_IP..."
scp users-local-export.json $SERVER_USER@$SERVER_IP:/tmp/

if [ $? -ne 0 ]; then
    echo "❌ Erro ao copiar arquivo para o servidor!"
    exit 1
fi

echo "✅ Arquivo copiado para o servidor"
echo ""

# Executa importação no servidor
echo "📥 Importando dados no servidor remoto..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
    echo "🔄 Fazendo backup dos usuários atuais..."
    docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=users --out=/tmp/users-backup-$(date +%Y%m%d-%H%M%S).json --jsonArray
    
    echo "📋 Usuários ANTES da importação:"
    docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval "db.users.countDocuments()"
    
    echo ""
    echo "🗑️  Removendo usuários antigos..."
    docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval "db.users.deleteMany({})"
    
    echo ""
    echo "📥 Importando novos usuários..."
    docker cp /tmp/users-local-export.json mk-edge-mongo:/tmp/
    docker exec mk-edge-mongo mongoimport --db=mkedgetenants --collection=users --file=/tmp/users-local-export.json --jsonArray
    
    echo ""
    echo "📋 Usuários DEPOIS da importação:"
    docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval "
        const count = db.users.countDocuments();
        print('Total: ' + count);
        print('');
        db.users.find({}, {nome: 1, login: 1, email: 1, celular: 1, roles: 1}).forEach(u => {
            print('- ' + u.nome + ' (' + u.login + ')');
            print('  Email: ' + (u.email || '❌'));
            print('  Celular: ' + (u.celular || '❌'));
            print('  Roles: ' + JSON.stringify(u.roles));
            print('');
        });
    "
    
    echo "✅ Importação concluída!"
    
    # Limpeza
    rm /tmp/users-local-export.json
ENDSSH

echo ""
echo "✅ Sincronização concluída!"
echo ""

# Limpeza local
rm users-local-export.json
