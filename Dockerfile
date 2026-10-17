# LiveVote — single image that builds shared + server + client and serves them
# from one Node process. SQLite lives on a mounted volume for persistence.
FROM node:20-slim AS base
# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm install

# ---- build ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
# Data dir for the SQLite volume, owned by the non-root node user (H6) so the
# named volume it mounts onto inherits that ownership.
RUN mkdir -p /app/data && chown -R node:node /app
# Bring the installed deps and built artifacts over, owned by node.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

# Drop root (H6).
USER node

# Container healthcheck hits the app's /api/health (M8).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
