# API MK-Edge - Documentação de Endpoints

## Variáveis de Ambiente (Local.bru)

```
baseUrl = http://localhost:3333
clientId = 20
tenantId = 63dd998b885eb427c8c51958
authToken = seu_token_aqui
```

## Endpoints Disponíveis

### Health & Info
- **GET /health** - Verifica se servidor está ativo
- **GET /api/info** - Informações da API
- **GET /api/status** - Status da API

### Agente
- **GET /agent/ping** - Testa conexão com agente
- **GET /agent/test** - Teste completo do agente

### Autenticação (Auth/)
- **POST /api/auth/admin/login** - Login admin
- **POST /api/auth/portal/login** - Login portal (CNPJ)
- **POST /api/auth/logout** - Logout
- **GET /api/auth/verify** - Verifica token
- **GET /api/me** - Dados do usuário logado

### Chamados/Tickets (Chamados/)
- **GET /requests/overdue** - Listar chamados em atraso
- **POST /requests** - Listar chamados (com filtros)
- **POST /request** - **[NOVO]** Criar novo chamado
- **GET /request/form/:clientId** - **[NOVO]** Carregar dados do formulário
- **GET /requests/history** - Histórico de chamados
- **GET /request/:id** - Buscar chamado específico
- **POST /request/:id** - Fechar/atualizar chamado
- **POST /messages** - **[NOVO]** Adicionar mensagem ao chamado

### Clientes (Clientes/)
- **GET /client/:id** - Buscar cliente por ID
- **PUT /client/:login** - **[ATUALIZADO]** Atualizar cliente (coordenadas, CTO, dados pessoais, etc)
- **GET /connections/:client_id** - Listar conexões do cliente
- **GET /invoices/:client_id** - Listar invoices (MOVED TO Faturas/)

### Faturas/Invoices (Faturas/) - **[NOVO]**
- **GET /invoices/:client_id** - Listar faturas pendentes e pagas
- **POST /invoice/pay** - Marcar fatura como pago

### CTOs (CTOs/) - **[NOVO]**
- **GET /cto/:latitude/:longitude** - Buscar CTOs próximas (raio ~350m)
- **GET /cto/:lat/:lng** - Alias com lat/lng
- **GET /cto?cto_name=CTO-001** - Buscar CTO específica e seus clientes

### Dashboard (Dashboard/)
- **GET /dashboard/stats** - Estatísticas do dashboard

### Busca (Busca/)
- **GET /search** - Busca global (clientes, chamados, etc)

### Instalador (Instalador/)
- **GET /api/installer/script/:tenantId** - Download script instalador
- **GET /api/installer/download/:tenantId** - Download binário
- **POST /request** (deprecated) - GET /request/installer endpoint

## Fluxo Típico de Uso

### 1. Criar Chamado
```
GET /request/form/:clientId         → Carrega técnicos e assuntos
POST /request                        → Cria novo chamado
```

### 2. Listar e Gerenciar Chamados
```
POST /requests                       → Lista chamados com filtros
GET /request/:id                     → Detalhes do chamado
POST /messages                       → Adiciona mensagem/nota
POST /request/:id                    → Fecha chamado
```

### 3. Gerenciar Faturas
```
GET /invoices/:clientId              → Lista faturas
POST /invoice/pay                    → Marca como pago
```

### 4. Gerenciar Faturas
```
GET /invoices/:clientId              → Lista faturas
POST /invoice/pay                    → Marca como pago
```

### 5. Gerenciar Cliente
```
GET /client/:id                      → Dados do cliente
POST /client/:id                     → Atualiza observação
GET /connections/:clientId           → Conexões
```

### 6. Buscar CTOs Próximas
```
GET /cto/:latitude/:longitude        → Lista CTOs dentro de 350m
GET /cto?cto_name=CTO-001           → Lista clientes em uma CTO
```

## Notas Importantes

- **Tenant Middleware**: Rotas precisam de `tenant_id` para multi-tenancy
- **Bearer Token**: Algumas rotas requerem autenticação
- **Parâmetros**: Usar query params (?tenant_id=xxx) ou path params (/client/20)
- **Datas**: Usar formato ISO 8601 ou "YYYY-MM-DD HH:MM"
- **Tabelas**: sis_suporte (suporte), sis_solic (instalação), sis_msg (mensagens)
- **CTOs**: Usa tabela mp_caixa (caixas hermétcas) com cálculo de distância geográfica

## Atualizações Recentes (16/01/2026)

✅ Endpoint GET /cto/:latitude/:longitude criado para buscar CTOs próximas
✅ Endpoint GET /cto para buscar CTO específica
✅ Chamados agora ordenados por DESC (mais recentes primeiro)
✅ Endpoint POST /invoice/pay com suporte a campo coletor
✅ Endpoint GET /request/form/:clientId com carregamento de técnicos/assuntos
✅ Endpoint POST /invoice/pay para recebimento de faturas
✅ GET /requests/history com ordenação DESC por data
✅ **[CORREÇÃO IMPORTANTE]** PUT /client/:login agora suporta:
  - Coordenadas (latitude/longitude ou string única)
  - CTO/Caixa Hermética (new_cto ou caixa_herm)
  - Observação com data de lembrança (rem_obs)
  - Automac (zera MAC e seta automac='sim')
  - Todos os campos de endereço e dados pessoais
