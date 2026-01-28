# Certificados EFI/Gerencianet

Este diretório armazena os certificados P12 para integração com a API Pix da EFI (Gerencianet).

## Para Testes de Integração

### Como obter o certificado de homologação:

1. Acesse: https://gerencianet.com.br/
2. Faça login na conta de homologação
3. Vá em: **API** → **Meus Aplicativos** → **Certificados**
4. Baixe o certificado `.p12` de homologação
5. Coloque o arquivo aqui como: `efi-homologacao.p12`

### Como obter as credenciais:

1. No painel da Gerencianet/EFI
2. Vá em: **API** → **Meus Aplicativos**
3. Crie um aplicativo ou use existente
4. Copie o **Client_Id** e **Client_Secret**
5. Cole no arquivo `.env`:
   ```
   EFI_CLIENT_ID=seu_client_id
   EFI_CLIENT_SECRET=seu_client_secret
   ```

### Chave PIX:

1. Cadastre uma chave PIX no painel EFI
2. Pode ser: email, telefone, CNPJ ou chave aleatória
3. Cole no `.env`:
   ```
   EFI_PIX_KEY=sua_chave@email.com
   ```

### Executar teste:

```bash
node test-efi-integration.js
```

## Para Produção

### Estrutura

Os certificados são salvos automaticamente quando enviados via API:
- `{tenant_id}_efi_homologacao.p12` - Certificado de Homologação
- `{tenant_id}_efi_producao.p12` - Certificado de Produção

## Como fazer upload

### Via API

```bash
curl -X POST http://localhost:3333/api/integrations/efi/upload-certificate \
  -H "Authorization: Bearer {token}" \
  -F "certificate=@/caminho/certificado.p12" \
  -F "environment=homologacao"
```

Ambientes disponíveis:
- `homologacao` - Ambiente de testes (Sandbox)
- `producao` - Ambiente de produção

## Segurança

⚠️ **IMPORTANTE**: 
- Certificados são arquivos sensíveis e NÃO devem ser commitados no Git
- O `.gitignore` já está configurado para ignorá-los
- Mantenha backups dos certificados em local seguro
- Cada tenant possui seus próprios certificados

## Permissões

Os certificados devem ter permissões de leitura apenas para o usuário que executa a aplicação.

## Geração de Certificados

Os certificados devem ser gerados na conta EFI:
1. Acesse sua conta EFI
2. Vá em "API" → "Meus Certificados"
3. Selecione o ambiente (Homologação ou Produção)
4. Clique em "Novo Certificado"
5. Baixe o arquivo .p12 gerado
6. Faça upload via API ou painel admin

## Formato

- **Formato aceito**: `.p12` (PKCS#12)
- **Senha**: vazia (padrão EFI)
- **Conversão**: Se necessário converter para .pem, use OpenSSL conforme documentação EFI
