# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (incluindo dev para build se necessário)
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Production stage
FROM node:18-alpine

# Instalar dumb-init e bash para gerenciamento correto de processos
RUN apk add --no-cache dumb-init bash

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copiar dependências do builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copiar código da aplicação
COPY --chown=nodejs:nodejs . .

# Copiar e dar permissão ao script de entrypoint
COPY --chown=nodejs:nodejs docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Mudar para usuário não-root
USER nodejs

# Expor porta da aplicação
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usar dumb-init para gerenciar processos corretamente
ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]

# Comando de start
CMD ["node", "src/server.js"]
