# ============================================
# Stage 1: Build Stage
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package*.json ./

# Copy workspace package files
COPY apps/worker/package*.json ./apps/worker/
COPY packages/db/package.json ./packages/db/

# Copy shared Prisma schema
COPY packages/db/prisma ./packages/db/prisma/
COPY packages/db/index.ts ./packages/db/
COPY packages/db/tsconfig.json ./packages/db/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci --workspace=apps/worker --workspace=packages/db --include-workspace-root

# Generate Prisma Client
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# Copy worker source code and compile TypeScript
COPY apps/worker/tsconfig.json ./apps/worker/
COPY apps/worker/src ./apps/worker/src/
RUN npm run build --workspace=apps/worker

# ============================================
# Stage 2: Production Stage
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# CRITICAL: Install OpenSSL for Prisma on Alpine Linux
RUN apk add --no-cache openssl

# Set production environment
ENV NODE_ENV=production

# Copy root workspace files
COPY package*.json ./

# Copy workspace package files
COPY apps/worker/package*.json ./apps/worker/
COPY packages/db/package.json ./packages/db/

# Copy Prisma schema (needed for prisma generate in postinstall)
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/index.ts ./packages/db/
COPY --from=builder /app/packages/db/tsconfig.json ./packages/db/

# Install ONLY production dependencies
RUN npm ci --omit=dev --workspace=apps/worker --workspace=packages/db --include-workspace-root

# Copy compiled JavaScript from builder
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Copy pre-generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create non-root user for security
RUN addgroup -g 1001 nodejs && \
    adduser -S botrunner -u 1001 -G nodejs && \
    chown -R botrunner:nodejs /app

# Switch to non-root user
USER botrunner

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Run migrations at RUNTIME, then start bot
CMD ["npm", "run", "start:prod", "--workspace=apps/worker"]
