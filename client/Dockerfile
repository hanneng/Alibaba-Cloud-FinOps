# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# Use China npm mirror for faster downloads
RUN npm config set registry https://registry.npmmirror.com

# Copy root workspace config
COPY package.json ./
COPY tsconfig.base.json ./

# Copy client workspace
COPY client/package.json ./client/
COPY client/tsconfig.json ./client/
COPY client/vite.config.ts ./client/
COPY client/env.d.ts ./client/
COPY client/tailwind.config.js ./client/
COPY client/postcss.config.js ./client/
COPY client/index.html ./client/
COPY client/src ./client/src

# Install dependencies and build
RUN npm install --workspace=client --include-workspace-root
RUN cd client && npx vite build

# --- Production stage ---
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/client/dist /usr/share/nginx/html

# Copy nginx config
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
