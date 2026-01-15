# MK-Edge Instalação e Configuração

## 📖 Documentação Completa do MK-Edge

Bem-vindo ao MK-Edge! Este documento detalha o processo de instalação, configuração e uso do agente MK-Edge.

---

## 1. Requisitos do Sistema

### Servidor Linux
- **SO**: Ubuntu 18.04 LTS ou superior (ou Debian equivalente)
- **PHP**: 7.4 ou superior
- **Extensões PHP**: curl, json, openssl, sqlite3 (opcional)
- **Espaço em disco**: Mínimo 100MB para instalação
- **Memória**: Mínimo 512MB RAM

### Acesso
- Acesso ao servidor via SSH com privilégios `sudo`
- Conexão com internet (HTTPS) para comunicação com o dashboard central

### Serviços Opcionais
- MySQL/MariaDB (opcional, para persistência de dados)
- Redis (opcional, para cache)

---

## 2. Processo de Instalação

### Método 1: Instalação Automatizada (Recomendado)

Execute o comando fornecido durante o checkout:

```bash
curl -s https://updata.com.br/mk-edge/installer.sh | bash -s TENANT_ID EMAIL
```

Substitua:
- `TENANT_ID` - ID único do seu tenant (fornecido no email)
- `EMAIL` - Seu email de conta

**O instalador irá:**
1. ✅ Verificar requisitos do sistema
2. ✅ Criar estrutura de diretórios
3. ✅ Fazer download dos arquivos da API
4. ✅ Configurar permissões corretamente
5. ✅ Validar a instalação

### Método 2: Instalação Manual

Se a instalação automatizada falhar:

```bash
# 1. Criar diretório
sudo mkdir -p /opt/mk-auth/admin/addons/mk-edge
cd /opt/mk-auth/admin/addons/mk-edge

# 2. Fazer download dos arquivos
sudo curl -o api.php https://updata.com.br/mk-edge/api.php
sudo curl -o config.php https://updata.com.br/mk-edge/config.php
sudo curl -o .htaccess https://updata.com.br/mk-edge/.htaccess

# 3. Criar arquivo de configuração
cat > config.json << EOF
{
  "tenant_id": "TENANT_ID",
  "email": "seu-email@domain.com",
  "api_url": "https://api.mkedge.com.br",
  "version": "1.0.0",
  "installed_at": "$(date -Iseconds)",
  "status": "active"
}
EOF

# 4. Configurar permissões
sudo chown -R www-data:www-data /opt/mk-auth/admin/addons/mk-edge
sudo chmod -R 755 /opt/mk-auth/admin/addons/mk-edge
sudo chmod 644 /opt/mk-auth/admin/addons/mk-edge/*.php
sudo chmod 644 /opt/mk-auth/admin/addons/mk-edge/config.json

# 5. Criar diretórios de logs
sudo mkdir -p /opt/mk-auth/admin/addons/mk-edge/logs
sudo chmod 755 /opt/mk-auth/admin/addons/mk-edge/logs
```

---

## 3. Pós-Instalação

### Verificar Status

```bash
curl -H "X-Tenant-ID: seu-tenant-id" \
     https://seu-dominio.com/opt/mk-auth/admin/addons/mk-edge/health
```

Resposta esperada:
```json
{
  "success": true,
  "message": "Agent is running",
  "data": {
    "agent": "MK-Edge",
    "version": "1.0.0",
    "status": "active",
    "tenant_id": "seu-tenant-id"
  }
}
```

### Configurar Variáveis de Ambiente

Edite `config.php` ou defina variáveis de ambiente:

```bash
export ZAPI_TOKEN="seu-token-zapi"
export ZAPI_INSTANCE_ID="sua-instance-id"
export SMTP_HOST="seu-smtp-host"
export SMTP_USER="seu-email@domain.com"
export SMTP_PASS="sua-senha"
```

---

## 4. Endpoints da API

### Health Check
```
GET /health
```
Verifica se o agente está rodando. Não requer autenticação.

### Status do Agente
```
GET /status
Headers: X-Tenant-ID, Authorization: Bearer TOKEN
```
Retorna informações de status do agente.

### Receber Webhook
```
POST /webhook
Headers: X-Tenant-ID: TENANT_ID
Body: {
  "type": "message",
  "data": {...}
}
```
Recebe webhooks do ZAPI/WhatsApp.

### Enviar Mensagem
```
POST /messages
Headers: X-Tenant-ID, Authorization: Bearer TOKEN
Body: {
  "phone": "5521999999999",
  "message": "Olá!",
  "media": {...} (opcional)
}
```
Envia uma mensagem via WhatsApp.

### Atualizar Configuração
```
PUT /config
Headers: X-Tenant-ID, Authorization: Bearer TOKEN
Body: {
  "zapi_token": "novo-token",
  "zapi_instance_id": "nova-instance"
}
```
Atualiza configurações do agente.

### Consultar Logs
```
GET /logs?limit=100
Headers: X-Tenant-ID, Authorization: Bearer TOKEN
```
Retorna os últimos logs do agente.

---

## 5. Integração com ZAPI (WhatsApp)

### Setup Básico

1. Criar conta em https://z-api.io
2. Obter `Token` e `Instance ID`
3. Configurar no painel MK-Edge ou via API:

```bash
curl -X PUT https://seu-dominio.com/api/mk-edge/config \
     -H "X-Tenant-ID: TENANT_ID" \
     -H "Authorization: Bearer SEU_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "zapi_token": "seu-token-zapi",
       "zapi_instance_id": "sua-instance-id"
     }'
```

### Webhook do ZAPI

Configure o webhook no painel ZAPI para:
```
https://seu-dominio.com/opt/mk-auth/admin/addons/mk-edge/webhook
```

---

## 6. Troubleshooting

### Problema: "Permission denied"

```bash
sudo chown -R www-data:www-data /opt/mk-auth/admin/addons/mk-edge
sudo chmod -R 755 /opt/mk-auth/admin/addons/mk-edge
```

### Problema: "PHP not found"

```bash
# Verificar se PHP está instalado
php --version

# Instalar se necessário (Ubuntu/Debian)
sudo apt update
sudo apt install php php-cli php-curl php-json
```

### Problema: "Logs directory not writable"

```bash
sudo mkdir -p /opt/mk-auth/admin/addons/mk-edge/logs
sudo chown www-data:www-data /opt/mk-auth/admin/addons/mk-edge/logs
sudo chmod 755 /opt/mk-auth/admin/addons/mk-edge/logs
```

### Problema: "cURL error"

Verifique conexão com internet e se a extensão curl do PHP está ativada:

```bash
php -m | grep curl
```

### Problema: "Tenant ID mismatch"

Certifique-se de que:
1. O `X-Tenant-ID` no header corresponde ao instalado
2. O arquivo `config.json` contém o ID correto

---

## 7. Monitoramento

### Verificar Logs Locais

```bash
# Logs de eventos
tail -f /opt/mk-auth/admin/addons/mk-edge/logs/events.log

# Logs de erros PHP
tail -f /opt/mk-auth/admin/addons/mk-edge/logs/errors.log

# Logs do sistema
tail -f /var/log/apache2/error.log  # Para Apache
tail -f /var/log/nginx/error.log    # Para Nginx
```

### Monitorar via Dashboard

Acesse o painel MK-Edge para visualizar:
- Status do agente em tempo real
- Histórico de mensagens
- Webhooks recebidos
- Logs consolidados

---

## 8. Segurança

### Boas Práticas

1. **Mantenha atualizado**: Instale patches de segurança regularmente
2. **Backup de config.json**: Faça backup das configurações
3. **Rotação de tokens**: Altere tokens regularmente
4. **Logs**: Monitore logs para atividades suspeitas
5. **Firewall**: Restrinja acesso SSH e HTTP

### Proteção de Arquivo

Os arquivos sensíveis estão protegidos pelo `.htaccess`:
- `config.php` não pode ser acessado diretamente
- `logs/` não é listável
- Apenas `api.php` recebe requisições

---

## 9. Atualização

Para atualizar para nova versão:

```bash
# Fazer backup da configuração atual
cp /opt/mk-auth/admin/addons/mk-edge/config.json \
   /opt/mk-auth/admin/addons/mk-edge/config.json.backup

# Executar novo instalador
curl -s https://updata.com.br/mk-edge/installer.sh | \
  bash -s TENANT_ID EMAIL

# Verificar versão
curl -H "X-Tenant-ID: TENANT_ID" \
     https://seu-dominio.com/opt/mk-auth/admin/addons/mk-edge/health
```

---

## 10. Desinstalação

Para remover o agente:

```bash
# Remover arquivo de configuração do ZAPI
# (Opcional: fazer no painel ZAPI também)

# Remover diretório
sudo rm -rf /opt/mk-auth/admin/addons/mk-edge

# Confirmar remoção
ls /opt/mk-auth/admin/addons/
```

---

## 11. Suporte

Se encontrar problemas:

1. **Documentação**: https://docs.mkedge.com.br
2. **Email**: support@mkedge.com.br
3. **WhatsApp**: +55 21 99999-9999
4. **GitHub Issues**: https://github.com/mkedge/agent/issues

---

## 12. Changelog

### Versão 1.0.0
- ✅ Instalação automatizada
- ✅ API REST completa
- ✅ Suporte a ZAPI/WhatsApp
- ✅ Sistema de logs
- ✅ Health check
- ✅ Documentação completa

---

**Última atualização**: 2024
**Versão da documentação**: 1.0.0
