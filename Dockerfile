# DEPLOY-1 / FLY — Node ≥20 monorepo image that runs @odp/pilot only.
# App root is the repo root (npm workspaces). Pilot depends on
# @odp/domain, @odp/passport-engine, @odp/matching-engine, @odp/distribution-engine.
# PILOT SEMANTICS = FROZEN — this file is ops only.

FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages

RUN npm ci \
 && npm run build -w @odp/domain \
 && npm run build -w @odp/passport-engine \
 && npm run build -w @odp/matching-engine \
 && npm run build -w @odp/distribution-engine \
 && npm run build -w @odp/pilot

ENV NODE_ENV=production
ENV ODP_PILOT_HOST=0.0.0.0
ENV ODP_PILOT_PORT=3200
ENV ODP_PILOT_DATA=/data

EXPOSE 3200

# Static pages resolve from packages/pilot/public via import.meta.url (not cwd).
# Data dir is ODP_PILOT_DATA=/data (Fly volume). Local default remains .odp/pilot.
CMD ["node", "packages/pilot/dist/server.js"]
