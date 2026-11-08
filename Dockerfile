FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY my-app/package.json my-app/package-lock.json ./
RUN npm ci

# Build application
FROM base AS builder
WORKDIR /workspace
COPY --from=deps /app/node_modules ./my-app/node_modules
COPY my-app ./my-app
COPY prisma ./prisma

WORKDIR /workspace/my-app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
RUN npx prisma generate --config prisma.config.ts
RUN npm run build

# Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /workspace/my-app/public ./public
COPY --from=builder --chown=nextjs:nodejs /workspace/my-app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /workspace/my-app/src/generated/prisma ./src/generated/prisma
COPY --from=builder /workspace/my-app/node_modules ./node_modules
COPY --from=builder /workspace/my-app/package.json ./package.json

USER nextjs

EXPOSE 3000

CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
