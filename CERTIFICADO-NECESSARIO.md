# ⚠️ Certificado EFI Necessário

O teste falhou porque a API EFI **requer certificado P12** para autenticação.

## Como obter o certificado (Homologação):

### 1. Acesse o painel EFI
https://gerencianet.com.br/ (faça login com credenciais de homologação)

### 2. Navegue até Certificados
**API → Aplicações → Certificados → Homologação**

### 3. Baixe o certificado
- Formato: `.p12` (PKCS#12)
- Ambiente: **Homologação**

### 4. Coloque o arquivo aqui:
```
mk-edge-api/certificates/efi-homologacao.p12
```

### 5. Execute o teste novamente:
```bash
node test-efi-simple.js
```

---

## Alternativa: Teste sem certificado (não recomendado)

Para testes rápidos **apenas no ambiente de homologação**, você pode:

1. Contatar suporte EFI para liberar seu IP
2. Ou usar SDK oficial que gerencia certificados automaticamente

---

## Credenciais atuais (.env):

```
EFI_SANDBOX=true
EFI_CLIENT_ID=${process.env.EFI_CLIENT_ID || 'não configurado'}
EFI_CLIENT_SECRET=${process.env.EFI_CLIENT_SECRET || 'não configurado'}
EFI_PIX_KEY=${process.env.EFI_PIX_KEY || 'não configurado'}
```

✅ Cliente ID: ${process.env.EFI_CLIENT_ID ? 'Configurado' : '❌ Não configurado'}
✅ Client Secret: ${process.env.EFI_CLIENT_SECRET ? 'Configurado' : '❌ Não configurado'}  
✅ Chave PIX: ${process.env.EFI_PIX_KEY ? 'Configurado' : '❌ Não configurado'}

---

## Próximos passos:

1. ✅ Credenciais já estão no banco
2. ⏳ **Baixe o certificado e coloque em certificates/efi-homologacao.p12**
3. ⏳ Execute: `node test-efi-simple.js`
4. ⏳ Teste o pagamento com PIX Copia e Cola gerado

