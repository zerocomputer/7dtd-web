# ROTWOOD — single-port production image (static frontend + WebSocket server).
# Timeweb App Platform: choose Dockerfile, exposed port 8080, health path /health.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV WS_PORT=8080
# curl is not part of node:22-alpine. Timeweb's examples (and some health
# checkers) probe the container with curl, so keep it in the runtime image.
RUN apk add --no-cache curl
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
RUN chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "server/index.mjs"]
