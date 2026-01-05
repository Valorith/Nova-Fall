# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-logic/package.json ./packages/game-logic/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY packages/game-logic ./packages/game-logic

# Generate Prisma client and build
RUN pnpm --filter @nova-fall/api db:generate
RUN pnpm --filter @nova-fall/shared build
RUN pnpm --filter @nova-fall/game-logic build
RUN pnpm --filter @nova-fall/api build

# Production stage
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "cd apps/api && pnpm db:migrate && pnpm start"]
