FROM node:22-alpine

WORKDIR /app

# Instala apenas dependências de produção para imagem enxuta
COPY package*.json ./
RUN npm ci --omit=dev

# Copia código da aplicação e CSV oficial do Recife
COPY . .

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
