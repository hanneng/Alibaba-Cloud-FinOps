# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# Use China npm mirror for faster downloads
RUN npm config set registry https://registry.npmmirror.com

# Copy root workspace config
COPY package.json ./
COPY tsconfig.base.json ./

# Copy server workspace
COPY server/package.json ./server/
COPY server/tsconfig.json ./server/
COPY server/drizzle.config.ts ./server/
COPY server/src ./server/src

# Install all workspace dependencies
RUN npm install --workspace=server --include-workspace-root

# --- Production stage ---
FROM node:20-alpine AS production
WORKDIR /app

# Copy built server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server

# Create uploads directory
RUN mkdir -p /app/server/uploads

# Set working directory to server
WORKDIR /app/server

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start the server
CMD ["node", "--import", "tsx", "src/index.ts"]
