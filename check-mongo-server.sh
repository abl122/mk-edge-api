#!/bin/bash

# Script para verificar MongoDB no servidor 172.31.255.4
# Salve como check-mongo-server.sh

echo ""
echo "========================================"
echo "🔍 MongoDB no Servidor 172.31.255.4"
echo "========================================"
echo ""

docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval '
print("=== RESUMO DO MONGODB ===");
print("");
print("Total de usuários: " + db.users.countDocuments());
print("Com email: " + db.users.countDocuments({email: {$exists: true}}));
print("Com celular: " + db.users.countDocuments({celular: {$exists: true}}));
print("Admin: " + db.users.countDocuments({roles: "admin"}));
print("Portal: " + db.users.countDocuments({roles: "portal"}));
print("Com tenant_id: " + db.users.countDocuments({tenant_id: {$exists: true}}));
print("");
print("=== USUÁRIOS ===");
db.users.find({}).forEach(u => {
    print("");
    print("👤 " + u.nome + " (" + u.login + ")");
    print("   Email: " + (u.email || "❌"));
    print("   Celular: " + (u.celular || "❌"));
    print("   Roles: " + JSON.stringify(u.roles));
    print("   Tenant ID: " + (u.tenant_id || "(não tem)"));
    print("   Ativo: " + u.ativo);
    print("   Bloqueado: " + u.bloqueado);
    print("   Tentativas Login: " + u.tentativas_login);
    print("   Último Login: " + (u.ultimo_login || "(nunca)"));
    print("   Criado em: " + u.criado_em);
});
'

echo ""
echo "✅ Verificação concluída"
