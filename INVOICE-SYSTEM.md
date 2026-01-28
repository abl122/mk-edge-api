# Sistema de Faturas (Invoices)

Sistema completo de gerenciamento de faturas para controle de pagamentos de assinaturas.

## Estrutura

### Schema (Invoice.js)

Campos principais:
- `numero`: Número sequencial da fatura (formato: YYYYMM0001)
- `tenant_id`: Referência ao provedor
- `subscription_id`: Referência à assinatura
- `descricao`: Descrição da cobrança
- `valor`: Valor da fatura
- `data_vencimento`: Data de vencimento
- `status`: pendente | paga | vencida | cancelada

#### Objeto de Pagamento
```javascript
pagamento: {
  data_pagamento: Date,
  valor_pago: Number,
  metodo: String, // manual, pix, boleto, cartao
  referencia_efi: String, // Referência da transação EFI
  baixado_por: ObjectId // Usuário que fez a baixa manual
}
```

#### Objeto PIX (EFI)
```javascript
pix: {
  txid: String,
  qr_code: String,
  qr_code_image: String,
  pix_copy_paste: String,
  expiracao: Date
}
```

### InvoiceService.js

Métodos principais:

#### 1. `gerarNumeroFatura()`
Gera número sequencial único para a fatura no formato `YYYYMM0001`.

#### 2. `gerarFatura(subscriptionId, dataVencimento, dados)`
Cria uma nova fatura baseada nos dados da assinatura.

```javascript
const invoice = await InvoiceService.gerarFatura(
  subscriptionId,
  new Date('2024-02-01')
);
```

#### 3. `registrarPagamentoManual(invoiceId, dados, userId)`
Registra pagamento manual (baixa) de uma fatura.

```javascript
await InvoiceService.registrarPagamentoManual(
  invoiceId,
  {
    valor_pago: 99.90,
    metodo: 'pix',
    observacao: 'Pagamento confirmado via comprovante'
  },
  userId // ID do usuário que está fazendo a baixa
);
```

#### 4. `registrarPagamentoEFI(txid, dadosPagamento)`
Processa webhook de pagamento da EFI automaticamente.

```javascript
await InvoiceService.registrarPagamentoEFI(
  'EFI_TXN_12345',
  {
    valor: 99.90,
    data_pagamento: new Date(),
    referencia: 'EFI_TXN_12345'
  }
);
```

#### 5. `listarFaturas(tenantId, filtros)`
Lista faturas com filtros opcionais.

```javascript
const faturas = await InvoiceService.listarFaturas(tenantId, {
  status: 'pendente',
  data_inicio: new Date('2024-01-01'),
  data_fim: new Date('2024-12-31')
});
```

#### 6. `marcarFaturasVencidas()`
Atualiza status de faturas pendentes que já venceram.

```javascript
const vencidas = await InvoiceService.marcarFaturasVencidas();
// Retorna número de faturas atualizadas
```

## API Endpoints

### 1. Listar Faturas
```
GET /api/invoices?status=pendente&data_inicio=2024-01-01&data_fim=2024-12-31
```

**Requer autenticação**: Sim  
**Query params**:
- `status`: pendente, paga, vencida, cancelada
- `data_inicio`: Data inicial (YYYY-MM-DD)
- `data_fim`: Data final (YYYY-MM-DD)

**Resposta**:
```json
{
  "success": true,
  "invoices": [
    {
      "_id": "...",
      "numero": "2024020001",
      "valor": 99.90,
      "data_vencimento": "2024-02-05",
      "status": "pendente",
      "tenant": { "nome_fantasia": "Provedor XYZ" },
      "subscription": { "plan_name": "Plano Premium" }
    }
  ]
}
```

### 2. Registrar Pagamento Manual
```
POST /api/invoices/:id/manual-payment
```

**Requer autenticação**: Sim  
**Body**:
```json
{
  "valor_pago": 99.90,
  "metodo": "pix",
  "observacao": "Pagamento confirmado via comprovante"
}
```

**Resposta**:
```json
{
  "success": true,
  "message": "Pagamento registrado com sucesso",
  "invoice": { ... }
}
```

### 3. Webhook EFI (Pagamento Automático)
```
POST /api/webhooks/efi/payment
```

**Requer autenticação**: Não (endpoint público)  
**Body**:
```json
{
  "txid": "EFI_TXN_12345",
  "valor": 99.90,
  "status": "approved",
  "data_pagamento": "2024-02-01T10:30:00Z"
}
```

## Jobs Automáticos

### 1. Geração de Faturas Mensais
**Cron**: `0 0 1 * *` (Todo dia 1º às 00:00)  
**Função**: Gera faturas para todas as assinaturas ativas com ciclo mensal

### 2. Atualização de Faturas Vencidas
**Cron**: `0 6 * * *` (Diariamente às 06:00)  
**Função**: Marca faturas pendentes como vencidas quando passam da data

## Fluxo de Pagamento

### Fluxo Manual (Baixa)
1. Admin acessa lista de faturas pendentes
2. Seleciona fatura e clica em "Registrar Pagamento"
3. Informa valor, método e observação
4. Sistema marca fatura como "paga" e registra dados do pagamento
5. Sistema registra ID do usuário que fez a baixa

### Fluxo Automático (EFI)
1. Sistema gera fatura e solicita PIX à EFI
2. EFI retorna dados do PIX (QR Code, copia-cola, etc)
3. Sistema armazena dados do PIX na fatura
4. Cliente paga via PIX
5. EFI envia webhook com confirmação
6. Sistema marca fatura como "paga" automaticamente

## Status de Faturas

- **pendente**: Fatura criada, aguardando pagamento
- **paga**: Pagamento confirmado (manual ou automático)
- **vencida**: Passou da data de vencimento sem pagamento
- **cancelada**: Fatura cancelada (subscription cancelada ou plano alterado)

## Execução Manual do Job

Para executar o job de geração de faturas manualmente:

```bash
node src/jobs/InvoiceGenerationJob.js
```

Isso é útil para:
- Testes
- Geração retroativa de faturas
- Correção de erros no agendamento

## Observações

1. **Unicidade**: O número da fatura é único e sequencial
2. **Histórico**: Todos os pagamentos mantêm histórico completo
3. **Rastreabilidade**: Pagamentos manuais registram quem fez a baixa
4. **Timezone**: Jobs executam no horário de São Paulo (America/Sao_Paulo)
5. **Logs**: Todas as operações são registradas no sistema de logs
