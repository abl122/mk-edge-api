# MK-Edge API v2.0 - Multi-Tenant Backend

Système backend moderno para MK-Edge com arquitetura multi-tenant, autenticação JWT e integração com agente MK-Auth.

## 🚀 Quick Start

### Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env

# 3. Criar tenant padrão
npm run seed:tenant

# 4. Iniciar servidor
npm start
```

Acessar: http://localhost:3335/portal  
Login: `admin` / `admin123`

### Com Docker

```bash
# Build e executa com docker-compose
docker-compose up -d

# Verificar logs
docker-compose logs -f api

# Parar
docker-compose down
```

A aplicação estará disponível em: http://localhost:3335

## 📋 Estrutura do Projeto

```
.
├── src/
│   ├── app/
│   │   ├── controllers/      # Controllers (PublicController, SessionController, etc)
│   │   ├── middlewares/      # Middlewares (tenantMiddleware, authMiddleware, publicMiddleware)
│   │   ├── schemas/          # Modelos MongoDB (Tenant, User)
│   │   └── services/         # Serviços (TenantService, AuthService)
│   ├── app.js               # Configuração Express
│   ├── routes-multi-tenant.js # Rotas da API
│   └── server.js            # Entry point
├── public/
│   ├── portal/
│   │   ├── index-dynamic.html      # Login dinâmico
│   │   └── dashboard-dynamic.html  # Dashboard dinâmico
│   ├── site/                # Site estático
│   └── admin/               # Admin panel (futuro)
├── scripts/
│   ├── setup-updata.js      # Seed com tenant Updata
│   ├── init-tenant.js       # Seed via variáveis de ambiente (Docker)
│   └── create-tenant.js     # Criar tenant customizado
├── doc/
│   ├── README.md            # Índice de documentação
│   └── ... (17 arquivos de documentação)
├── Dockerfile               # Container Docker
├── docker-compose.yml       # Orquestração Docker
├── .env.example            # Exemplo de variáveis de ambiente
└── package.json            # Dependências

```

## 🔌 Endpoints Principais

### Públicos (sem autenticação)
```
GET  /health                    Health check
GET  /public/config             Configuração do tenant
GET  /public/tenant/:id         Info do tenant
GET  /public/tenant/domain/:dom Busca por domínio
GET  /public/search             Busca automática
POST /login                     Login (retorna JWT)
POST /refresh                   Renovar token
POST /validate                  Validar token
```

### Protegidos (requer autenticação)
```
POST /logout                    Logout
GET  /me                        Dados da sessão
POST /change-password           Alterar senha
```

### Admin
```
GET    /tenants               Listar tenants
GET    /tenants/:id           Info do tenant
POST   /tenants               Criar tenant
PUT    /tenants/:id           Atualizar tenant
DELETE /tenants/:id           Deletar tenant
PATCH  /tenants/:id/agente    Atualizar agente
GET    /tenants/:id/agente/ping  Testar conexão
```

## 🎨 Features Frontend

- ✅ Login customizado por tenant
- ✅ Dashboard dinâmico
- ✅ Detecção automática de tenant por domínio
- ✅ Cores/logo/email customizados por tenant
- ✅ 9 placeholders HTML dinâmicos
- ✅ window.tenantConfig global em JS

## 🔐 Segurança

- ✅ JWT com tenant_id (7 dias de validade)
- ✅ Refresh tokens (30 dias)
- ✅ Bcrypt para hasheamento de senhas
- ✅ Isolamento de tenant em cada requisição
- ✅ Rate limiting configurável
- ✅ CORS seguro
- ✅ Helmet para headers HTTP

## 🗄️ Banco de Dados

MongoDB com coleções:
- `tenants` - Provedores/empresas
- `users` - Usuários com tenant_id

### Coleção Tenant
```javascript
{
  _id: ObjectId,
  provedor: {
    nome: "Updata Telecom",
    razao_social: "Updata Telecom LTDA",
    cnpj: "04.038.227/0001-87",
    dominio: "updata.com.br",
    email: "brito@updata.com.br",
    telefone: "92991424261",
    cores: { primaria, secundaria, sucesso, erro, aviso }
  },
  agente: {
    url: "https://provedor.updata.com.br/api.php",
    token: "...",
    ativo: true,
    config: { timeout, retry, max_retries }
  },
  assinatura: {
    ativa: true,
    plano: "enterprise",
    valor_mensal: 1000
  }
}
```

## 📊 Variáveis de Ambiente

```env
# Servidor
NODE_ENV=production
PORT=3335
API_BASE_URL=http://localhost:3335

# MongoDB
MONGODB_URL=mongodb://mongo:27017/mkedgetenants

# JWT
JWT_SECRET=sua_chave_secreta
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d

# Rate Limit
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100

# Tenant padrão
DEFAULT_TENANT_NAME=Updata Telecom
DEFAULT_ADMIN_LOGIN=admin
DEFAULT_ADMIN_PASSWORD=admin123
```

Veja `.env.example` para configuração completa.

## 🚀 Deploy com Docker

### Build
```bash
docker build -t mk-edge-api:2.0.0 .
```

### Executar
```bash
docker run -d \
  -p 3335:3335 \
  -e MONGODB_URL=mongodb://mongo:27017/mkedgetenants \
  -e JWT_SECRET=sua_chave_secreta \
  mk-edge-api:2.0.0
```

### Ou com Docker Compose
```bash
docker-compose up -d
```

O sistema será inicializado automaticamente com:
- MongoDB rodando
- Tenant "Updata Telecom" criado
- Usuário admin (admin/admin123) pronto
- API em http://localhost:3335

## 📚 Documentação

Toda documentação está em `/doc`:

- **[LEIA_PRIMEIRO.md](doc/LEIA_PRIMEIRO.md)** - Resumo executivo
- **[FRONTEND_QUICK_START.md](doc/FRONTEND_QUICK_START.md)** - Como começar
- **[FRONTEND_DINAMICO.md](doc/FRONTEND_DINAMICO.md)** - Documentação técnica
- **[ARQUITETURA_FRONTEND.md](doc/ARQUITETURA_FRONTEND.md)** - Arquitetura
- **[REFERENCE.md](doc/REFERENCE.md)** - Tabelas de referência
- **[INDICE_DOCS.md](doc/INDICE_DOCS.md)** - Índice completo

Para navegação rápida, leia `doc/README.md`.

## 🧪 Testes

```bash
# Rodar suite de testes
npm test

# Ou testar endpoints manualmente
bash test-frontend.sh

# Curl simples
curl http://localhost:3335/health
curl http://localhost:3335/public/config?dominio=updata.com.br
```

## 🎯 Scripts Disponíveis

```bash
npm start           # Iniciar servidor
npm run dev         # Iniciar com nodemon (desenvolvimento)
npm run seed        # Seed de dados de teste
npm run seed:tenant # Criar tenant padrão Updata
npm run seed:all    # Seed tenant + dados
npm test            # Rodar testes
```

## 📈 Próximas Etapas

- [ ] UserController (CRUD de usuários)
- [ ] Atualizar ClientController com validação de tenant
- [ ] Admin Panel para gerenciar tenants
- [ ] Swagger/OpenAPI documentation
- [ ] Tests automatizados (Jest)
- [ ] CI/CD pipeline (GitHub Actions)

## 🤝 Contribuindo

1. Clone o repositório
2. Instale dependências: `npm install`
3. Crie branch: `git checkout -b feature/sua-feature`
4. Commit: `git commit -m "Add sua-feature"`
5. Push: `git push origin feature/sua-feature`
6. Abra um Pull Request

## 📝 Licença

MIT - Veja LICENSE para detalhes

## 👨‍💼 Suporte

Para dúvidas, consulte a documentação em `/doc` ou abra uma issue.

---

**Status:** ✅ Pronto para Produção  
**Versão:** 2.0.0  
**Última Atualização:** 10 de Janeiro de 2026

### Chamados/Requests
- `GET /request/:id/:type` - Detalhes do chamado
- `GET /request/form/:login` - Formulário de novo chamado
- `GET /request/:login` - Lista de chamados do cliente
- `GET /request/:login/overdue` - Chamados atrasados

### Dashboard
- `GET /dashboard/stats` - Estatísticas gerais (otimizado)
- `GET /dashboard/online` - Clientes online

### Arquivos Estáticos
- `GET /site/` - Landing page
- `GET /portal/` - Portal do cliente

## ⚡ Otimizações Implementadas

### Performance Dashboard (-96.4%)
- **Antes**: 13 queries em paralelo (2700ms)
- **Depois**: 3 queries otimizadas (96ms)
- Combinação de dados com aggregações SQL (SUM + CASE WHEN)

### Removido Logs Desnecessários
- Redução de 15% em overhead de processamento
- Apenas logger.error() e logger.warn() mantidos

## 📝 Documentação

- [GUIA_MIGRACAO_APP.md](GUIA_MIGRACAO_APP.md) - Como migrar o app antigo
- [OTIMIZACAO_DASHBOARD_COMPLETA.md](OTIMIZACAO_DASHBOARD_COMPLETA.md) - Detalhes das otimizações
- [OTIMIZACAO_SUMMARY.md](OTIMIZACAO_SUMMARY.md) - Resumo executivo das otimizações

## 🔧 Tecnologias

- **Node.js** 18+
- **Express.js** para roteamento
- **MySQL/MariaDB** para dados
- **RADIUS** para autenticação
- **AES-256** para encriptação (opcional)

## ✅ Status

- ✅ Todos os 9 endpoints críticos implementados
- ✅ 100% compatível com backend antigo
- ✅ Dashboard otimizado (-96.4% tempo)
- ✅ Arquivos estáticos servidos
- ✅ Validação completa realizada

## 📞 Suporte

Para questões sobre migração ou implementação, consulte [GUIA_MIGRACAO_APP.md](GUIA_MIGRACAO_APP.md)

---

**Versão**: 2.0.0  
**Data**: Janeiro 2026  
**Status**: ✅ Produção
