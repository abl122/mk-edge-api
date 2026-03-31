/**
 * Middleware para servir conteúdo público dinamicamente
 * Injeta variáveis de tenant nas páginas HTML
 */

const path = require('path');
const fs = require('fs');
const TenantService = require('../services/TenantService');

/**
 * Middleware que carrega dados do tenant e injeta nas páginas públicas
 * Suporta:
 * - URL com domínio customizado: provedor.exemplo.com.br/portal
 * - URL com tenant_id: localhost:3335/portal?tenant_id=xxx
 * - Query param: localhost:3335/portal?dominio=provedor.exemplo.com.br
 */
async function publicMiddleware(req, res, next) {
  try {
    console.log('🔧 publicMiddleware - START');
    let tenant = null;
    const { tenant_id, dominio } = req.query;
    let hostDomain = req.hostname;

    // 1. Tenta buscar por tenant_id na query
    if (tenant_id) {
      tenant = await TenantService.findById(tenant_id);
    }

    // 2. Tenta buscar por domínio na query
    if (!tenant && dominio) {
      tenant = await TenantService.findByDomain(dominio);
    }

    // 3. Tenta buscar pelo hostname da requisição
    if (!tenant) {
      // Remove www. e porta
      hostDomain = req.hostname.replace('www.', '').split(':')[0];
      
      // Se não for localhost ou 127.0.0.1, busca por domínio
      if (!['localhost', '127.0.0.1'].includes(hostDomain)) {
        tenant = await TenantService.findByDomain(hostDomain);
      }
    }

    // Valida subscription ativa (mesmo sem tenant, continua para não quebrar site estático)
    if (tenant && !tenant.assinatura?.ativa) {
      tenant = null;
    }

    // Injeta dados do tenant no request para uso em handlers posteriores
    req.tenantPublic = tenant ? {
      id: tenant._id,
      nome: tenant.provedor.nome,
      razao_social: tenant.provedor.razao_social,
      cnpj: tenant.provedor.cnpj,
      email: tenant.provedor.email,
      telefone: tenant.provedor.telefone,
      dominio: tenant.provedor.dominio,
      website: tenant.provedor.website,
      logo: tenant.provedor.logo,
      cores: tenant.provedor.cores || {
        primaria: '#2563eb',
        secundaria: '#1e40af',
        sucesso: '#10b981',
        erro: '#ef4444',
        aviso: '#f59e0b'
      },
      plano: tenant.assinatura?.plano
    } : null;

    console.log('🔧 publicMiddleware - END, calling next()');
    next();
  } catch (error) {
    console.error('Erro no publicMiddleware:', error.message);
    // Continua mesmo com erro para não quebrar a requisição
    req.tenantPublic = null;
    next();
  }
}

/**
 * Middleware para servir HTML com template injection
 * Processa arquivo HTML e injeta dados do tenant
 */
function serveHtmlWithTenant(filePath) {
  return (req, res, next) => {
    const fullPath = path.join(__dirname, '../../..', filePath);

    // Verifica se arquivo existe
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send('Arquivo não encontrado');
    }

    // Lê arquivo HTML
    let html = fs.readFileSync(fullPath, 'utf-8');

    // Injeta dados do tenant
    const tenant = req.tenantPublic || {};
    
    // Substitui placeholders no HTML
    const replacements = {
      '{{TENANT_ID}}': tenant.id || '',
      '{{TENANT_NOME}}': tenant.nome || 'MK-Edge',
      '{{TENANT_EMAIL}}': tenant.email || 'contato@mk-edge.com',
      '{{TENANT_TELEFONE}}': tenant.telefone || '(85) 3000-0000',
      '{{TENANT_WEBSITE}}': tenant.website || '#',
      '{{TENANT_LOGO}}': tenant.logo || '/images/logo.png',
      '{{COR_PRIMARIA}}': tenant.cores?.primaria || '#2563eb',
      '{{COR_SECUNDARIA}}': tenant.cores?.secundaria || '#1e40af',
      '{{COR_SUCESSO}}': tenant.cores?.sucesso || '#10b981',
      '{{COR_ERRO}}': tenant.cores?.erro || '#ef4444',
      '{{COR_AVISO}}': tenant.cores?.aviso || '#f59e0b',
    };

    // Aplica replacements
    Object.keys(replacements).forEach(placeholder => {
      html = html.replace(new RegExp(placeholder, 'g'), replacements[placeholder]);
    });

    // Injeta variáveis JS globais
    const jsVars = `
      <script>
        window.tenantConfig = {
          id: '${tenant.id || ''}',
          nome: '${tenant.nome || 'MK-Edge'}',
          email: '${tenant.email || ''}',
          telefone: '${tenant.telefone || ''}',
          cores: {
            primaria: '${tenant.cores?.primaria || '#2563eb'}',
            secundaria: '${tenant.cores?.secundaria || '#1e40af'}',
            sucesso: '${tenant.cores?.sucesso || '#10b981'}',
            erro: '${tenant.cores?.erro || '#ef4444'}',
            aviso: '${tenant.cores?.aviso || '#f59e0b'}'
          },
          apiBase: '${process.env.API_BASE_URL || 'http://localhost:3335'}'
        };
      </script>
    `;

    // Injeta no final do <head> ou antes do </head>
    html = html.replace('</head>', jsVars + '</head>');

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  };
}

module.exports = {
  publicMiddleware,
  serveHtmlWithTenant
};
