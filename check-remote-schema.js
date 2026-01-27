#!/usr/bin/env node

/**
 * Script para verificar o schema da collection users no MongoDB remoto
 * Execute este script DIRETAMENTE no servidor via SSH:
 * 
 * ssh root@172.31.255.4
 * cd /path/to/mk-edge-api
 * node check-remote-schema.js
 */

const mongoose = require('mongoose');
const util = require('util');

// URL do MongoDB remoto (interno do Docker)
const MONGODB_URL = 'mongodb://172.26.0.2:27017/mkedgetenants';

async function getCollectionSchema(connection, collectionName) {
  try {
    const db = connection.db;
    const collection = db.collection(collectionName);
    
    const sampleDoc = await collection.findOne({});
    
    if (!sampleDoc) {
      return { error: 'Coleção vazia', fields: [] };
    }
    
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

async function main() {
  let conn;
  
  try {
    console.log('🔍 Verificando schema da collection "users" no MongoDB REMOTO...\n');
    
    console.log('📡 Conectando ao MongoDB...');
    conn = await mongoose.createConnection(MONGODB_URL).asPromise();
    console.log('✅ Conectado ao MongoDB\n');
    
    console.log('📊 Analisando collection "users"...');
    const schema = await getCollectionSchema(conn, 'users');
    
    if (schema.error) {
      console.error('❌ Erro:', schema.error);
      return;
    }
    
    console.log('\n========================================');
    console.log('📋 INFORMAÇÕES GERAIS');
    console.log('========================================\n');
    
    console.log(`Documentos: ${schema.sampleCount}`);
    console.log(`Campos: ${schema.fields.length}`);
    console.log(`Índices: ${schema.indexes.length}`);
    
    console.log('\n========================================');
    console.log('📝 TODOS OS CAMPOS');
    console.log('========================================\n');
    
    schema.fields.forEach(field => {
      console.log(`  - ${field}: ${schema.fieldTypes[field]}`);
    });
    
    console.log('\n========================================');
    console.log('📑 ÍNDICES');
    console.log('========================================\n');
    
    schema.indexes.forEach(idx => {
      console.log(`  - ${JSON.stringify(idx.key)} ${idx.unique ? '(UNIQUE)' : ''} ${idx.sparse ? '(SPARSE)' : ''}`);
    });
    
    console.log('\n========================================');
    console.log('📝 SCHEMA COMPLETO (JSON)');
    console.log('========================================\n');
    console.log(JSON.stringify(schema.fieldTypes, null, 2));
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    if (conn) {
      await conn.close();
      console.log('\n✅ Conexão fechada');
    }
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
