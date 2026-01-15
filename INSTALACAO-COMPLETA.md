# 🚀 MK-Edge V2 - Instalação Concluída

## ✅ Status da Instalação

**Data**: 12 de Janeiro de 2026  
**Local**: `/root/mk-edge`  
**Status**: ✅ **INSTALADO E RODANDO** (sem apontamento)

---

## 📦 Containers Criados

### Novo Backend (V2)
- **Container API**: `mk-edge-api-new`
- **Porta**: `3336` (host) → `3335` (container)
- **URL**: http://localhost:3336
- **Status**: ✅ HEALTHY

### MongoDB Novo
- **Container**: `mk-edge-mongo-new`  
- **Porta**: `27018` (host) → `27017` (container)
- **Database**: `mkedgetenants`
- **Status**: ✅ HEALTHY

### Backend Atual (Antigo)
- **Container API**: `mk-edge-api`
- **Porta**: `3333` (não exposta externamente)
- **Status**: ✅ Rodando normalmente via Proxy Manager

---

## 🔐 Credenciais Admin

**Login**: `admin`  
**Senha**: `admin123`  
**Email**: admin@updata.com.br

**Tenant ID**: `63dd998b885eb427c8c51958`  
**Tenant**: Updata Telecom

---

## 🌐 Estrutura de Rede

```
┌─────────────────────────────────────────────┐
│  Nginx Proxy Manager (porta 80/443)        │
│  mk-edge.com.br/api → mk-edge-api:3333     │ ← ATUAL (não modificado)
└─────────────────────────────────────────────┘
                    │
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│  mk-edge-api    │   │ mk-edge-api-new │
│  (antigo)       │   │  (novo v2)      │
│  porta 3333     │   │  porta 3336     │
│  MongoDB antigo │   │  MongoDB 27018  │
└─────────────────┘   └─────────────────┘
```

---

## 🧪 Como Testar Localmente

### 1. Health Check
```bash
curl http://localhost:3336/health
```

### 2. Listar Tenants
```bash
curl http://localhost:3336/tenants \
  -H "Authorization: Bearer <token>"
```

### 3. Login Admin
```bash
curl -X POST http://localhost:3336/login \
  -H "Content-Type: application/json" \
  -d '{
    "login": "admin",
    "senha": "admin123",
    "tenant_id": "63dd998b885eb427c8c51958"
  }'
```

### 4. Ver Logs
```bash
cd /root/mk-edge
docker-compose logs -f api
```

---

## 🔄 Quando Fazer o SWAP (Trocar Apontamento)

### Passo 1: Acessar Nginx Proxy Manager
URL: http://seu-servidor:81

### Passo 2: Editar Proxy Host
- Host: `mk-edge.com.br`
- Scheme: `http`
- **Forward Hostname**: `mk-edge-api-new` ← Nome do novo container
- **Forward Port**: `3335` ← Porta interna do container

### Passo 3: Salvar e Testar
Acesse: https://mk-edge.com.br/api/health

### Passo 4: Rollback (se necessário)
Voltar apontamento para:
- Forward Hostname: `mk-edge-api`
- Forward Port: `3333`

**⚠️ IMPORTANTE**: O container `mk-edge-api-new` já está na rede `internal_network`, pronto para o swap!

---

## 📊 Diferenças Entre V1 e V2

| Recurso | V1 (Atual) | V2 (Novo) |
|---------|------------|-----------|
| Multi-tenant | ❌ Não | ✅ Sim |
| MongoDB | Conexão direta | ✅ Schema estruturado |
| Admin Panel | ❌ Não | ✅ Sim (`/admin`) |
| Porta API | 3333 | 3335 (interno) / 3336 (externo) |
| Porta Mongo | 27017 | 27017 (interno) / 27018 (externo) |
| Container | mk-edge-api | mk-edge-api-new |
| Logs | Básicos | ✅ Winston estruturado |

---

## 🛠️ Comandos Úteis

### Ver Status dos Containers
```bash
docker ps | grep mk-edge
```

### Parar Novo Backend
```bash
cd /root/mk-edge
docker-compose down
```

### Iniciar Novo Backend
```bash
cd /root/mk-edge
docker-compose up -d
```

### Ver Logs
```bash
cd /root/mk-edge
docker-compose logs -f api
```

### Acessar MongoDB Novo
```bash
docker exec -it mk-edge-mongo-new mongosh
```

---

## ⚠️ Observações Importantes

1. **O backend antigo continua rodando normalmente**
2. **Nenhum apontamento foi modificado** - apps continuam usando o backend antigo
3. **Novo backend está isolado** em rede separada (`mk-edge-network-new`)
4. **Porta 3336 disponível apenas localmente** para testes
5. **Quando fizer o swap**, será instantâneo via Nginx Proxy Manager

---

## 📝 Próximos Passos (Para o Swap)

1. ✅ Backend instalado e funcionando
2. ⏳ **Aguardando horário de baixo tráfego**
3. ⏳ Mudar apontamento no Nginx Proxy Manager
4. ⏳ Testar app com novo backend
5. ⏳ Monitorar logs por 10-15 minutos
6. ⏳ Se tudo OK, manter novo backend
7. ⏳ Se houver problema, fazer rollback imediato

---

## 🆘 Rollback de Emergência

Se após o swap houver problemas:

1. Acesse Nginx Proxy Manager
2. Volte apontamento para `mk-edge-api:3333`
3. App volta a usar backend antigo instantaneamente

**Tempo de rollback**: ~10 segundos

---

✅ **Instalação concluída com sucesso!**  
🕒 **Aguardando horário apropriado para fazer o swap**
