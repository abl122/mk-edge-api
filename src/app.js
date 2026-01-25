const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const routes = require('./routes');
const { publicMiddleware, serveHtmlWithTenant } = require('./app/middlewares/publicMiddleware');

const app = express();

// Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Permite event handlers inline (onclick, etc)
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
    },
  },
}));

// CORS configurado para aceitar frontend
const allowedOrigins = [
  'https://mk-edge.com.br',
  'http://mk-edge.com.br',
  'http://localhost:5173',
  'http://localhost:8080'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sem origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS bloqueado para origem:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware público que injeta dados do tenant em todas as requisições
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path}`);
  next();
});
app.use(publicMiddleware);

// ==================== ROTAS HTML (ANTES DO STATIC) ====================

console.log('🔥 Registrando rotas HTML...');

// Landing page (raiz)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pricing.html'));
});

// Admin routes
app.get('/admin/login', (req, res) => {
  console.log('📄 Serving admin login page');
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'login.html'));
});

// Servir index.html tanto para /admin quanto /admin/
app.get(['/admin', '/admin/'], (req, res) => {
  console.log('📄 Serving admin index page for:', req.path);
  const indexPath = path.join(__dirname, '..', 'public', 'admin', 'index.html');
  console.log('📁 File path:', indexPath);
  
  // Verificar se arquivo existe
  const fs = require('fs');
  if (!fs.existsSync(indexPath)) {
    console.error('❌ File not found:', indexPath);
    return res.status(404).send('Admin index.html not found');
  }
  
  console.log('✅ File exists, sending...');
  res.sendFile(indexPath);
});

// Portal routes (padrão igual ao admin)
console.log('🔥 Registrando rota: /portal/login');
app.get('/portal/login', serveHtmlWithTenant('public/portal/login.html'));

console.log('🔥 Registrando rota: /portal, /portal/, /portal/index.html');
// Rotas dinâmicas para portal (dashboard)
app.get(['/portal', '/portal/', '/portal/index.html'], (req, res, next) => {
  console.log('📍 Portal index route called!');
  serveHtmlWithTenant('public/portal/index.html')(req, res, next);
});

// Rotas legadas (compatibilidade)
app.get('/portal-login', (req, res) => {
  res.redirect('/portal/login');
});

app.get('/portal.html', (req, res) => {
  res.redirect('/portal/');
});

app.get('/portal/dashboard.html', (req, res) => {
  res.redirect('/portal/');
});

// Rotas diretas para arquivos HTML estáticos
app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pricing.html'));
});

app.get('/pricing.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pricing.html'));
});

app.get('/quick-start.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'quick-start.html'));
});

// Servir arquivos estáticos da pasta public (CSS, JS, imagens)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rotas da API com prefixo /api
app.use('/api', routes);

// Health check (sem prefixo para Nginx)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Nova API MK-Edge Multi-Tenant',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    tenantDetected: req.tenantPublic ? 'yes' : 'no'
  });
});

// Rota 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.path,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor',
  });
});

module.exports = app;
