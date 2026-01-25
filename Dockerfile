FROM node:18-alpine

RUN apk add --no-cache dumb-init bash

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copiar package.json e lock files
COPY --chown=nodejs:nodejs package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY --chown=nodejs:nodejs . .

# Copiar scripts de inicialização (se existir)
COPY --chown=nodejs:nodejs src/scripts/ /app/src/scripts/ 2>/dev/null || true

# Copiar docker-entrypoint script
COPY --chown=nodejs:nodejs docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3333

USER nodejs

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "src/server.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3333/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
