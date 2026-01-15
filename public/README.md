# 📁 Estrutura de Conteúdo Estático - Nova API MK-Edge

## 📂 Organização de Pastas

```
public/
├── site/                    # Site público (landing page)
│   ├── index.html           # Homepage
│   ├── images/              # Imagens do site
│   └── videos/              # Vídeos de demonstração
│
├── portal/                  # Portal do cliente (restrito)
│   ├── index.html           # Login do portal
│   └── dashboard.html       # Dashboard do cliente
│
├── admin/                   # Painel administrativo (restrito)
│   └── [Será preenchido conforme necessário]
│
├── .htaccess                # Configuração Apache
└── README.md                # Este arquivo
```

---

## 🌐 Roteamento

### Acesso via Node.js (Express)

Para servir os arquivos estáticos:

```javascript
app.use(express.static(path.join(__dirname, 'public')));

// Roteamento específico
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/site/index.html'));
});

app.get('/portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/portal/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/index.html'));
});
```

### Acesso via Apache (.htaccess)

Se servido por Apache, o `.htaccess` redireciona automaticamente:
- `/` → `/site/index.html`
- `/portal` → `/portal/index.html`
- `/admin` → `/admin/index.html`

---

## 📌 Conteúdo

### 🌐 Site (`/site`)
- **index.html** - Página inicial com informações do sistema
- **images/** - Screenshots e logos
- **videos/** - Vídeos de demonstração (demo.mp4)

### 🔐 Portal (`/portal`)
- **index.html** - Página de login do portal do cliente
- **dashboard.html** - Dashboard do cliente (após login)

### ⚙️ Admin (`/admin`)
- Reservado para painel administrativo (a ser implementado)

---

## 🔒 Segurança

### Acesso Restrito
- **Portal e Admin**: Requerem autenticação via API
- **Headers de Segurança**: Configurar nos headers do Express

```javascript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

### Autenticação
- Token JWT passado via cookie ou header
- Verificar no middleware antes de servir `/portal` e `/admin`

---

## 📋 Checklist de Configuração

- [ ] Verificar se Express está servindo arquivos estáticos
- [ ] Testar acesso a `/` (site)
- [ ] Testar acesso a `/portal` (login)
- [ ] Testar acesso a `/admin` (restrito)
- [ ] Configurar headers de segurança
- [ ] Testar autenticação no portal
- [ ] Testar autenticação no admin
- [ ] Verificar cache headers em produção
- [ ] Minificar CSS/JS em produção
- [ ] Configurar CORS se necessário

---

## 🚀 Próximos Passos

1. **Implementar painel admin** em `/admin`
2. **Adicionar autenticação** para portal e admin
3. **Melhorar responsividade** do portal/site
4. **Adicionar certificado SSL** em produção
5. **Otimizar imagens** e vídeos
6. **Implementar PWA** (Progressive Web App) no portal

---

**Data:** 09/01/2026  
**Versão:** 2.0.0  
**Status:** ✅ Estrutura organizada
