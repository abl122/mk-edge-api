// Script MongoDB para adicionar dados de contato aos usuários
// Execute: docker exec -it mk-edge-mongo mongosh mkedgetenants < add-contact-data.js
// Ou copie e cole diretamente no mongosh

print('\n========================================');
print('🔄 MIGRAÇÃO: Adicionando Dados de Contato');
print('========================================\n');

// Busca todos os usuários
const users = db.users.find({}).toArray();
print('📊 Encontrados ' + users.length + ' usuários\n');

let updated = 0;

users.forEach(user => {
  print('\n👤 Processando: ' + user.nome + ' (' + user.login + ')');
  
  const updates = {};
  let needsUpdate = false;
  
  // Verifica email
  if (!user.email) {
    print('   ⚠️  Email não definido');
    
    // Admin: usa email padrão
    if (user.roles && user.roles.includes('admin')) {
      updates.email = 'admin@mk-edge.com.br';
      print('   ✅ Será adicionado: admin@mk-edge.com.br');
      needsUpdate = true;
    }
    // Tenta recuperar de recuperacao_senha
    else if (user.recuperacao_senha && user.recuperacao_senha.email_recovery) {
      updates.email = user.recuperacao_senha.email_recovery;
      print('   ✅ Será adicionado do backup: ' + updates.email);
      needsUpdate = true;
    }
    // Cria email temporário
    else {
      updates.email = user.login + '@provedor.com.br';
      print('   ⚠️  Email temporário: ' + updates.email);
      print('   💡 ATENÇÃO: Atualizar manualmente!');
      needsUpdate = true;
    }
  } else {
    print('   ✅ Email: ' + user.email);
  }
  
  // Verifica celular
  if (!user.celular) {
    print('   ⚠️  Celular não definido');
    
    // Tenta recuperar de recuperacao_senha
    if (user.recuperacao_senha && user.recuperacao_senha.celular) {
      updates.celular = user.recuperacao_senha.celular;
      print('   ✅ Será adicionado do backup: ' + updates.celular);
      needsUpdate = true;
    } else {
      print('   ❌ Nenhum celular encontrado - adicionar manualmente!');
    }
  } else {
    print('   ✅ Celular: ' + user.celular);
  }
  
  // Aplica update se necessário
  if (needsUpdate) {
    const result = db.users.updateOne(
      { _id: user._id },
      { $set: updates }
    );
    
    if (result.modifiedCount > 0) {
      print('   ✅ Usuário atualizado!');
      updated++;
    }
  }
});

print('\n========================================');
print('📊 RESUMO');
print('========================================\n');
print('Total de usuários: ' + users.length);
print('Atualizados: ' + updated);

// Verificação final
print('\n========================================');
print('📋 VERIFICAÇÃO FINAL');
print('========================================\n');

const finalUsers = db.users.find({}).toArray();
let missingEmail = 0;
let missingCelular = 0;

finalUsers.forEach(user => {
  print('\n👤 ' + user.nome + ' (' + user.login + ')');
  print('   Email: ' + (user.email || '❌ FALTANDO'));
  print('   Celular: ' + (user.celular || '❌ FALTANDO'));
  print('   Telefone: ' + (user.telefone || '⚠️  Não definido (opcional)'));
  
  if (!user.email) missingEmail++;
  if (!user.celular) missingCelular++;
});

print('\n========================================');
print('Estado final:');
print('  ❌ Sem email: ' + missingEmail);
print('  ❌ Sem celular: ' + missingCelular);

if (missingEmail > 0 || missingCelular > 0) {
  print('\n⚠️  ATENÇÃO: Existem usuários sem dados de contato completos!');
  print('   Use updateOne para adicionar manualmente:\n');
  print('   db.users.updateOne(');
  print('     { login: "LOGIN_DO_USUARIO" },');
  print('     { $set: { email: "email@provedor.com.br", celular: "99999999999" } }');
  print('   );\n');
} else {
  print('\n✅ Todos os usuários têm dados de contato completos!\n');
}

print('✅ Migração concluída!\n');
