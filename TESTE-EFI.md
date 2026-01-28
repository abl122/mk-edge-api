# 🧪 Teste de Integração EFI - Guia de Execução

## Pré-requisitos

1. **Conta EFI/Gerencianet de Homologação**
   - Crie uma conta em: https://gerencianet.com.br
   - Solicite acesso ao ambiente de homologação

2. **Credenciais de API**
   - Client ID
   - Client Secret
   - Chave PIX cadastrada
   - Certificado P12

## Passo a Passo

### 1. Configure as Credenciais

Edite o arquivo `.env` e preencha:

```bash
# EFI (Gerencianet) - Homologação
EFI_SANDBOX=true
EFI_CLIENT_ID=Client_Id_XXXXXXX
EFI_CLIENT_SECRET=Client_Secret_XXXXXXX
EFI_PIX_KEY=sua_chave@email.com
EFI_CERT_PASSWORD=senha_do_certificado
```

### 2. Baixe o Certificado

1. Acesse o painel EFI → API → Meus Aplicativos → Certificados
2. Baixe o certificado de homologação (.p12)
3. Coloque em: `mk-edge-api/certificates/efi-homologacao.p12`

### 3. Execute o Teste

```bash
cd mk-edge-api
node test-efi-integration.js
```

## O que o teste faz

✅ **Teste 1**: Autenticação OAuth2
- Obtém token de acesso da EFI
- Valida credenciais

✅ **Teste 2**: Criar Cobrança PIX
- Gera uma cobrança de R$ 99,90
- Obtém QR Code e PIX Copia e Cola
- Define expiração de 1 hora

✅ **Teste 3**: Consultar Cobrança
- Busca dados da cobrança criada
- Valida status e valor

✅ **Teste 4**: Criar Fatura com PIX
- Cria registro de fatura no banco
- Vincula dados do PIX (txid, QR Code)

## Saída Esperada

```
🧪 === TESTE DE INTEGRAÇÃO EFI - HOMOLOGAÇÃO === 

📦 Conectando ao MongoDB...
✅ MongoDB conectado

🔧 Configurações EFI:
   Ambiente: HOMOLOGAÇÃO
   Client ID: ✅ Configurado
   Client Secret: ✅ Configurado
   PIX Key: teste@email.com

🔐 Teste 1: Autenticação OAuth2...
✅ Token obtido: eyJhbGciOiJIUzI1NiIsInR5cCI...

💰 Teste 2: Criar cobrança PIX...
✅ Cobrança criada:
   TXID: ABC123XYZ789
   Status: ATIVA
   Expira em: 2026-01-28T15:30:00.000Z
   PIX Copia e Cola: 00020126580014br.gov.bcb.pix...
   QR Code Image: ✅ Gerado

🔍 Teste 3: Consultar cobrança...
✅ Cobrança consultada:
   Status: ATIVA
   Valor: R$ 99.90

📄 Teste 4: Criar fatura com dados PIX...
✅ Fatura criada:
   ID: 679a1b2c3d4e5f6g7h8i9j0k
   Número: TEST202601001
   TXID PIX: ABC123XYZ789

✅ === TODOS OS TESTES PASSARAM === 

📋 Próximos passos:
   1. Use o QR Code ou PIX Copia e Cola para testar pagamento
   2. Configure webhook EFI para receber notificações
   3. Teste webhook em: POST /api/webhooks/efi/payment
```

## Testar Pagamento

1. **Copie o PIX Copia e Cola** do resultado
2. **Abra seu banco** (app ou internet banking)
3. **Cole o código PIX** para pagar
4. **Valor**: R$ 99,90
5. **Confirme o pagamento**

## Webhook EFI

Após configurar o webhook na EFI apontando para:
```
https://seu-dominio.com.br/api/webhooks/efi/payment
```

A EFI enviará:
```json
{
  "txid": "ABC123XYZ789",
  "valor": 99.90,
  "status": "approved",
  "data_pagamento": "2026-01-28T14:30:00Z",
  "endToEndId": "E12345678202601281430123456789"
}
```

## Erros Comuns

### ❌ Certificado não encontrado
```
⚠️ Certificado EFI não encontrado, usando modo sem certificado
```
**Solução**: Baixe o certificado e coloque em `certificates/efi-homologacao.p12`

### ❌ Credenciais inválidas
```
❌ Erro no teste: Falha na autenticação com EFI
```
**Solução**: Verifique Client ID e Client Secret no `.env`

### ❌ Chave PIX inválida
```
Error: Chave PIX não encontrada ou inválida
```
**Solução**: Cadastre uma chave PIX no painel EFI e configure no `.env`

## Próximos Passos

1. ✅ Teste passou? Configure webhook em produção
2. ✅ Integre com InvoiceService para gerar PIX automaticamente
3. ✅ Configure monitoramento de pagamentos
4. ✅ Teste em produção com valores reais (EFI_SANDBOX=false)
