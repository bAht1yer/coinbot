# ============================================
# Stage 1: Build Stage
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files first (Docker layer caching)
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and compile TypeScript
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ============================================
# Stage 2: Production Stage
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# ★ CRITICAL: Install OpenSSL for Prisma on Alpine Linux
RUN apk add --no-cache openssl

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# ★ CRITICAL: Copy prisma BEFORE npm ci
# postinstall script runs "prisma generate" which needs schema.prisma
COPY --from=builder /app/prisma ./prisma

# Install ONLY production dependencies (triggers postinstall -> prisma generate)
RUN npm ci --omit=dev

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Copy pre-generated prisma client from builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create non-root user for security
RUN addgroup -g 1001 nodejs && \
    adduser -S botrunner -u 1001 -G nodejs && \
    chown -R botrunner:nodejs /app

# Switch to non-root user
USER botrunner

# Health check (optional)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# ★ CRITICAL: Run migrations at RUNTIME, then start bot
# This ensures DATABASE_URL is available from Railway environment
CMD ["npm", "run", "start:prod"]
