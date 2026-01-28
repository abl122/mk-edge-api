#!/bin/bash

##############################################################################
# Script para sincronizar TODAS as collections do MongoDB local para remoto
# Execute este script NA SUA MÁQUINA LOCAL (não no servidor)
##############################################################################

SERVER_IP="172.31.255.4"
SERVER_USER="root"

echo ""
echo "========================================"
echo "🔄 SINCRONIZAÇÃO COMPLETA: Local → Remoto"
echo "========================================"
echo ""

COLLECTIONS=("tenants" "plans" "users" "invoices" "integrations")

# Exporta dados do MongoDB local
echo "📦 Exportando dados do MongoDB local..."
echo ""

for collection in "${COLLECTIONS[@]}"; do
    echo "   Exportando $collection..."
    mongoexport --db=mkedgetenants --collection=$collection --out=${collection}-export.json --jsonArray 2>/dev/null
    
    if [ -f "${collection}-export.json" ]; then
        lines=$(wc -l < ${collection}-export.json)
        echo "   ✅ $collection: $lines linhas"
    else
        echo "   ⚠️  $collection: não encontrado (pode não existir)"
    fi
done

echo ""
echo "✅ Exportação concluída"
echo ""

# Copia arquivos para o servidor
echo "📤 Copiando dados para o servidor $SERVER_IP..."
echo ""

for collection in "${COLLECTIONS[@]}"; do
    if [ -f "${collection}-export.json" ]; then
        echo "   Copiando $collection..."
        scp ${collection}-export.json $SERVER_USER@$SERVER_IP:/tmp/
    fi
done

echo ""
echo "✅ Arquivos copiados para o servidor"
echo ""

# Executa importação no servidor
echo "📥 Importando dados no servidor remoto..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
    echo ""
    echo "🔄 Fazendo backup dos dados atuais..."
    BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
    
    docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=tenants --out=/tmp/tenants-backup-$BACKUP_DATE.json --jsonArray 2>/dev/null
    docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=plans --out=/tmp/plans-backup-$BACKUP_DATE.json --jsonArray 2>/dev/null
    docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=users --out=/tmp/users-backup-$BACKUP_DATE.json --jsonArray 2>/dev/null
    docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=invoices --out=/tmp/invoices-backup-$BACKUP_DATE.json --jsonArray 2>/dev/null
    docker exec mk-edge-mongo mongoexport --db=mkedgetenants --collection=integrations --out=/tmp/integrations-backup-$BACKUP_DATE.json --jsonArray 2>/dev/null
    
    echo ""
    echo "📊 Dados ANTES da importação:"
    docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval "
        print('Tenants: ' + db.tenants.countDocuments());
        print('Plans: ' + db.plans.countDocuments());
        print('Users: ' + db.users.countDocuments());
        print('Invoices: ' + db.invoices.countDocuments());
        print('Integrations: ' + db.integrations.countDocuments());
    "
    
    echo ""
    echo "📥 Importando collections..."
    echo ""
    
    # Importar cada collection
    for collection in tenants plans users invoices integrations; do
        if [ -f /tmp/${collection}-export.json ]; then
            echo "   Importando $collection..."
            docker cp /tmp/${collection}-export.json mk-edge-mongo:/tmp/
            docker exec mk-edge-mongo mongoimport \
                --db=mkedgetenants \
                --collection=$collection \
                --file=/tmp/${collection}-export.json \
                --jsonArray \
                --mode=upsert \
                --upsertFields=_id 2>&1 | grep -v "^$" | head -5
            echo "   ✅ $collection importado"
            echo ""
        fi
    done
    
    echo ""
    echo "📊 Dados DEPOIS da importação:"
    docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval "
        print('Tenants: ' + db.tenants.countDocuments());
        print('Plans: ' + db.plans.countDocuments());
        print('Users: ' + db.users.countDocuments());
        print('Invoices: ' + db.invoices.countDocuments());
        print('Integrations: ' + db.integrations.countDocuments());
    "
    
    echo ""
    echo "✅ Importação concluída!"
    
    # Limpeza
    rm /tmp/*-export.json 2>/dev/null
ENDSSH

echo ""
echo "✅ SINCRONIZAÇÃO COMPLETA CONCLUÍDA!"
echo ""
echo "📋 Próximos passos:"
echo "   1. ssh $SERVER_USER@$SERVER_IP"
echo "   2. pm2 restart mk-edge-api"
echo "   3. pm2 logs mk-edge-api"
echo ""

# Limpeza local
rm *-export.json 2>/dev/null
