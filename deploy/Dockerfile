# =============================================================================
# GitUnderstand (git-understand.com) — Cloud Run Production Dockerfile
# Visual-first multimodal codebase intelligence studio powered by Gemini 4
# Multi-stage build for backend/ + shared/ contracts
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build stage (compile TypeScript ESM)
# -----------------------------------------------------------------------------
FROM node:22-slim AS builder

WORKDIR /app

# Ensure standard build dependencies & TLS certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy package manifests for clean layer caching
COPY package.json ./
COPY backend/package.json backend/package-lock.json ./backend/

# Install full dependencies including devDependencies for tsc compilation
RUN cd backend && npm ci

# Copy canonical shared types and backend source
COPY shared/ ./shared/
COPY backend/ ./backend/

# Compile TypeScript (outputs to backend/dist/backend/src and backend/dist/shared)
RUN cd backend && npm run build

# Prune devDependencies to keep runtime node_modules lean
RUN cd backend && npm prune --omit=dev


# -----------------------------------------------------------------------------
# Stage 2: Runtime stage (minimal, non-root user)
# -----------------------------------------------------------------------------
FROM node:22-slim AS runner

WORKDIR /app

# Ensure CA certificates for HTTPS outbound traffic (Gemini API, GitHub API)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Copy workspace and backend manifests
COPY package.json ./
COPY backend/package.json ./backend/

# Copy pruned production dependencies from builder
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Copy compiled distribution artifacts
COPY --from=builder /app/backend/dist ./backend/dist

# Copy canonical shared contracts (enables runtime project root resolution)
COPY shared/ ./shared/

# Prepare runtime directories for caching and generated artifacts, then assign ownership
RUN mkdir -p /app/backend/artifacts /app/backend/.cache /app/env \
  && chown -R node:node /app

# Run as non-root user for Cloud Run security compliance
USER node

# Expose HTTP / WebSocket server port
EXPOSE 8080

# Start GitUnderstand engine
CMD ["node", "backend/dist/backend/src/server.js"]
