# Docker image for CallAudit AI (self-hosted)
# Build:  docker build -t callaudit-ai .
# Run:    docker compose up -d   (recommended, see docker-compose.yml)

FROM node:20-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# --- deps ------------------------------------------------------------------
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl build-essential python3 \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# --- build -----------------------------------------------------------------
FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl build-essential python3 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- runtime ---------------------------------------------------------------
FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

ENV NODE_ENV=production
ENV STORAGE_DIR=/data/storage

COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nextjs:nodejs /app/instrumentation.ts ./instrumentation.ts
COPY --from=build --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /data/storage && chown -R nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs
EXPOSE 3000

# Apply migrations, then start. First run only: add `npm run db:seed` for demo data.
CMD ["sh", "-c", "npx prisma db push --skip-generate && next start -H 0.0.0.0 -p ${PORT:-3000}"]
