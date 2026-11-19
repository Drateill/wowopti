# Image de production de Forever Theorycraft : app React compilée + petit serveur Node
# (relais vers l'API Blizzard et la recherche Wowhead). Les clés Blizzard arrivent par
# variables d'environnement (secret Kubernetes), jamais dans l'image.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "dist-server/server.mjs"]
