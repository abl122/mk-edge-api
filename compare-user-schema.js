const mongoose = require('mongoose');
const util = require('util');

// Configurações
const LOCAL_MONGODB_URL = 'mongodb://localhost:27017/mkedgetenants';
const REMOTE_MONGODB_URL = 'mongodb://172.26.0.2:27017/mkedgetenants';

/**
 * Obtém o schema de uma coleção
 */
async function getCollectionSchema(connection, collectionName) {
  try {
    const db = connection.db;
    const collection = db.collection(collectionName);
    
    // Pega um documento de exemplo
    const sampleDoc = await collection.findOne({});
    
    if (!sampleDoc) {
      return { error: 'Coleção vazia', fields: [] };
    }
    
    // Extrai os campos e seus tipos
    const fields = {};
    const analyzeObject = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        
        if (value === null) {
          fields[fieldPath] = 'null';
        } else if (value instanceof Date) {
          fields[fieldPath] = 'Date';
        } else if (mongoose.Types.ObjectId.isValid(value) && typeof value === 'object') {
          fields[fieldPath] = 'ObjectId';
        } else if (Array.isArray(value)) {
          fields[fieldPath] = `Array<${value.length > 0 ? typeof value[0] : 'unknown'}>`;
          if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
            analyzeObject(value[0], fieldPath + '[0]');
          }
        } else if (typeof value === 'object') {
          fields[fieldPath] = 'Object';
          analyzeObject(value, fieldPath);
        } else {
          fields[fieldPath] = typeof value;
        }
      }
    };
    
    analyzeObject(sampleDoc);
    
    // Pega informações sobre índices
    const indexes = await collection.indexes();
    
    return {
      fields: Object.keys(fields).sort(),
      fieldTypes: fields,
      indexes: indexes,
      sampleCount: await collection.countDocuments({}),
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Compara os schemas
 */
function compareSchemas(localSchema, remoteSchema) {
  const comparison = {
    onlyInLocal: [],
    onlyInRemote: [],
    different: [],
    same: [],
  };
  
  if (localSchema.error || remoteSchema.error) {
    return {
      error: `Local: ${localSchema.error || 'OK'}, Remote: ${remoteSchema.error || 'OK'}`
    };
  }
  
  const localFields = new Set(localSchema.fields);
  const remoteFields = new Set(remoteSchema.fields);
  
  // Campos apenas no local
  for (const field of localFields) {
    if (!remoteFields.has(field)) {
      comparison.onlyInLocal.push({
        field,
        type: localSchema.fieldTypes[field]
      });
    }
  }
  
  // Campos apenas no remoto
  for (const field of remoteFields) {
    if (!localFields.has(field)) {
      comparison.onlyInRemote.push({
        field,
        type: remoteSchema.fieldTypes[field]
      });
    }
  }
  
  // Campos em ambos
  for (const field of localFields) {
    if (remoteFields.has(field)) {
      const localType = localSchema.fieldTypes[field];
      const remoteType = remoteSchema.fieldTypes[field];
      
      if (localType !== remoteType) {
        comparison.different.push({
          field,
          localType,
          remoteType
        });
      } else {
        comparison.same.push(field);
      }
    }
  }
  
  return comparison;
}

/**
 * Função principal
 */
async function main() {
  let localConn, remoteConn;
  
  try {
    console.log('🔍 Comparando schema da collection "users" entre MongoDB local e remoto...\n');
    
    // Conecta ao MongoDB local
    console.log('📡 Conectando ao MongoDB local...');
    localConn = await mongoose.createConnection(LOCAL_MONGODB_URL).asPromise();
    console.log('✅ Conectado ao MongoDB local\n');
    
    // Conecta ao MongoDB remoto
    console.log('📡 Conectando ao MongoDB remoto...');
    remoteConn = await mongoose.createConnection(REMOTE_MONGODB_URL).asPromise();
    console.log('✅ Conectado ao MongoDB remoto\n');
    
    // Obtém schemas
    console.log('📊 Analisando collection "users" no MongoDB local...');
    const localSchema = await getCollectionSchema(localConn, 'users');
    
    console.log('📊 Analisando collection "users" no MongoDB remoto...');
    const remoteSchema = await getCollectionSchema(remoteConn, 'users');
    
    console.log('\n========================================');
    console.log('📋 INFORMAÇÕES GERAIS');
    console.log('========================================\n');
    
    console.log('LOCAL:');
    console.log(`  - Documentos: ${localSchema.sampleCount}`);
    console.log(`  - Campos: ${localSchema.fields?.length || 0}`);
    console.log(`  - Índices: ${localSchema.indexes?.length || 0}`);
    
    console.log('\nREMOTO:');
    console.log(`  - Documentos: ${remoteSchema.sampleCount}`);
    console.log(`  - Campos: ${remoteSchema.fields?.length || 0}`);
    console.log(`  - Índices: ${remoteSchema.indexes?.length || 0}`);
    
    console.log('\n========================================');
    console.log('🔍 COMPARAÇÃO DE SCHEMAS');
    console.log('========================================\n');
    
    const comparison = compareSchemas(localSchema, remoteSchema);
    
    if (comparison.error) {
      console.error('❌ Erro na comparação:', comparison.error);
      return;
    }
    
    // Campos apenas no local
    if (comparison.onlyInLocal.length > 0) {
      console.log('⚠️  CAMPOS APENAS NO LOCAL (não existem no remoto):');
      comparison.onlyInLocal.forEach(({ field, type }) => {
        console.log(`  - ${field} (${type})`);
      });
      console.log('');
    } else {
      console.log('✅ Nenhum campo exclusivo do local\n');
    }
    
    // Campos apenas no remoto
    if (comparison.onlyInRemote.length > 0) {
      console.log('⚠️  CAMPOS APENAS NO REMOTO (não existem no local):');
      comparison.onlyInRemote.forEach(({ field, type }) => {
        console.log(`  - ${field} (${type})`);
      });
      console.log('');
    } else {
      console.log('✅ Nenhum campo exclusivo do remoto\n');
    }
    
    // Campos com tipos diferentes
    if (comparison.different.length > 0) {
      console.log('⚠️  CAMPOS COM TIPOS DIFERENTES:');
      comparison.different.forEach(({ field, localType, remoteType }) => {
        console.log(`  - ${field}:`);
        console.log(`      Local:  ${localType}`);
        console.log(`      Remoto: ${remoteType}`);
      });
      console.log('');
    } else {
      console.log('✅ Todos os campos comuns têm o mesmo tipo\n');
    }
    
    // Campos iguais
    console.log(`✅ CAMPOS IDÊNTICOS: ${comparison.same.length} campos`);
    if (comparison.same.length > 0 && comparison.same.length < 20) {
      console.log('  ' + comparison.same.join(', '));
    }
    
    console.log('\n========================================');
    console.log('📑 ÍNDICES');
    console.log('========================================\n');
    
    console.log('LOCAL:');
    localSchema.indexes?.forEach(idx => {
      console.log(`  - ${JSON.stringify(idx.key)} ${idx.unique ? '(UNIQUE)' : ''}`);
    });
    
    console.log('\nREMOTO:');
    remoteSchema.indexes?.forEach(idx => {
      console.log(`  - ${JSON.stringify(idx.key)} ${idx.unique ? '(UNIQUE)' : ''}`);
    });
    
    console.log('\n========================================');
    console.log('📝 SCHEMA COMPLETO LOCAL');
    console.log('========================================\n');
    console.log(util.inspect(localSchema.fieldTypes, { depth: null, colors: true }));
    
    console.log('\n========================================');
    console.log('📝 SCHEMA COMPLETO REMOTO');
    console.log('========================================\n');
    console.log(util.inspect(remoteSchema.fieldTypes, { depth: null, colors: true }));
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    // Fecha conexões
    if (localConn) {
      await localConn.close();
      console.log('\n✅ Conexão local fechada');
    }
    if (remoteConn) {
      await remoteConn.close();
      console.log('✅ Conexão remota fechada');
    }
  }
}

// Executa
main().then(() => process.exit(0)).catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
