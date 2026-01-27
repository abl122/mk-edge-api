#!/bin/bash

##############################################################################
# Script para verificar usuários no MongoDB via SSH
# Execute no servidor: bash remote-check-users.sh
##############################################################################

echo ""
echo "========================================"
echo "🔍 VERIFICANDO USUÁRIOS - MongoDB Remoto"
echo "========================================"
echo ""

# Verifica se o container do MongoDB está rodando
if ! docker ps | grep -q mk-edge-mongo; then
    echo "❌ Container mk-edge-mongo não está rodando!"
    echo ""
    echo "Containers ativos:"
    docker ps --format "table {{.Names}}\t{{.Status}}"
    exit 1
fi

echo "✅ Container mk-edge-mongo encontrado"
echo ""

# Executa mongosh para listar usuários
docker exec mk-edge-mongo mongosh mkedgetenants --quiet --eval '
// Lista todos os usuários
const users = db.users.find({}).toArray();

print("\n📊 Total de usuários: " + users.length + "\n");

if (users.length === 0) {
    print("⚠️  Nenhum usuário encontrado no banco!\n");
} else {
    users.forEach((user, index) => {
        print("=".repeat(60));
        print("👤 USUÁRIO " + (index + 1) + "/" + users.length);
        print("=".repeat(60));
        
        print("_id: " + user._id);
        print("nome: " + (user.nome || "❌ FALTANDO"));
        print("email: " + (user.email || "❌ FALTANDO"));
        print("login: " + (user.login || "❌ FALTANDO"));
        print("senha: " + (user.senha ? user.senha.substring(0, 20) + "..." : "❌ FALTANDO"));
        print("celular: " + (user.celular || "❌ FALTANDO"));
        print("telefone: " + (user.telefone || "(não definido)"));
        print("tenant_id: " + (user.tenant_id || "(não definido)"));
        print("roles: " + (user.roles ? JSON.stringify(user.roles) : "❌ FALTANDO"));
        print("permissoes: " + (user.permissoes ? JSON.stringify(user.permissoes) : "❌ FALTANDO"));
        print("ativo: " + (user.ativo !== undefined ? user.ativo : "❌ FALTANDO"));
        print("bloqueado: " + (user.bloqueado !== undefined ? user.bloqueado : "❌ FALTANDO"));
        print("tentativas_login: " + (user.tentativas_login !== undefined ? user.tentativas_login : "❌ FALTANDO"));
        print("ultimo_login: " + (user.ultimo_login || "(não definido)"));
        print("criado_em: " + (user.criado_em || "❌ FALTANDO"));
        print("atualizado_em: " + (user.atualizado_em || "❌ FALTANDO"));
        print("createdAt: " + (user.createdAt || "(não definido)"));
        print("updatedAt: " + (user.updatedAt || "(não definido)"));
        
        if (user.recuperacao_senha) {
            print("\nrecuperacao_senha:");
            print("  celular: " + (user.recuperacao_senha.celular || "(não definido)"));
            print("  codigo: " + (user.recuperacao_senha.codigo || "(não definido)"));
            print("  expira_em: " + (user.recuperacao_senha.expira_em || "(não definido)"));
            print("  metodo: " + (user.recuperacao_senha.metodo || "(não definido)"));
            print("  email_recovery: " + (user.recuperacao_senha.email_recovery || "(não definido)"));
        } else {
            print("\nrecuperacao_senha: ❌ FALTANDO");
        }
        
        // Verifica campos críticos faltantes
        const missing = [];
        if (!user.nome) missing.push("nome");
        if (!user.email) missing.push("email");
        if (!user.login) missing.push("login");
        if (!user.senha) missing.push("senha");
        if (!user.celular) missing.push("celular");
        if (!user.roles || user.roles.length === 0) missing.push("roles");
        if (!user.permissoes || user.permissoes.length === 0) missing.push("permissoes");
        
        if (missing.length > 0) {
            print("\n⚠️  CAMPOS CRÍTICOS FALTANDO: " + missing.join(", "));
        }
        print("");
    });
    
    print("=".repeat(60));
    print("📋 RESUMO");
    print("=".repeat(60));
    
    const admins = users.filter(u => u.roles && u.roles.includes("admin"));
    const portals = users.filter(u => u.roles && u.roles.includes("portal"));
    const withEmail = users.filter(u => u.email);
    const withCelular = users.filter(u => u.celular);
    const incomplete = users.filter(u => !u.email || !u.celular || !u.nome || !u.login);
    
    print("Total de usuários: " + users.length);
    print("- Admin: " + admins.length);
    print("- Portal: " + portals.length);
    print("- Com email: " + withEmail.length);
    print("- Com celular: " + withCelular.length);
    print("- Incompletos: " + incomplete.length);
    
    if (incomplete.length > 0) {
        print("\n⚠️  Usuários incompletos:");
        incomplete.forEach(u => {
            const missing = [];
            if (!u.nome) missing.push("nome");
            if (!u.email) missing.push("email");
            if (!u.login) missing.push("login");
            if (!u.celular) missing.push("celular");
            print("   - " + (u.login || u._id) + ": falta " + missing.join(", "));
        });
    }
}

print("\n✅ Verificação concluída\n");
'

echo ""
echo "✅ Script finalizado"
echo ""
