# Multi-stage Dockerfile — `dev` for local hot-reload, `prod` for quiverdefi.com.
#
# Build the prod image with:
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml build web
# Then bring it up:
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate web
#
# The dev stage is the default (matches the original behavior — `npm run dev`
# with bind-mounted source for instant hot-reload). The prod stage runs
# `next start` against a pre-built standalone output bundle, which is what
# delivers sub-200ms page transitions instead of dev-mode 15-30s on-demand
# compiles.

# ─────────────────────────────────────────────────────────
# Base: shared by all stages
# ─────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app


# ─────────────────────────────────────────────────────────
# deps: install all node_modules once, cache the layer
# ─────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json ./
RUN npm install


# ─────────────────────────────────────────────────────────
# dev: source bind-mounted via docker-compose, hot reload
# ─────────────────────────────────────────────────────────
FROM deps AS dev
EXPOSE 3000
CMD ["npm", "run", "dev"]


# ─────────────────────────────────────────────────────────
# builder: bake source + run `next build` (standalone output)
# ─────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
# Standalone output is set in next.config.mjs (`output: "standalone"`).
# Produces .next/standalone/ (server.js + minimal node_modules) plus
# .next/static/ which we copy alongside.
RUN npm run build


# ─────────────────────────────────────────────────────────
# prod: runs `node server.js` from the standalone bundle
# ─────────────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
# Standalone server doesn't need npm or the full node_modules — just the
# bundled server.js and its trimmed deps.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
