# ============================================
# Dockerfile — GiaSuConnect (Turlean)
# Dùng cho VPS deploy (không cần cho Vercel)
# Build: docker build -t giasuconnect .
# Run:   docker run -p 3000:3000 giasuconnect
# ============================================

# --- Stage 1: Dependencies ---
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY prisma ./prisma/

# Install ALL dependencies (cần devDependencies cho build)
RUN bun install --frozen-lockfile

# Generate Prisma client
ENV DATABASE_URL=file:./db/build.db
RUN bun run db:generate

# --- Stage 2: Build ---
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:./db/build.db

# Build Next.js (standalone output)
RUN bun run db:generate
RUN bun run build

# --- Stage 3: Production ---
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install curl for health check
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy standalone server + static + public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma files for runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create db directory for SQLite (if using SQLite)
RUN mkdir -p /app/db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

CMD ["bun", ".next/standalone/server.js"]
