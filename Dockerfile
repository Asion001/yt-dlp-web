# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy only necessary files for build
COPY src ./src
COPY tsconfig.json build.ts ./

# Build frontend assets
RUN bun run build.ts

# Production stage
FROM oven/bun:1-alpine

WORKDIR /app

# Install yt-dlp and ffmpeg (Alpine packages are much smaller)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    && pip3 install --no-cache-dir yt-dlp \
    && rm -rf /root/.cache /tmp/*

# Copy package files and install production dependencies only
COPY package.json bun.lockb* ./
RUN bun install --production --frozen-lockfile \
    && rm -rf /root/.bun/install/cache

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Copy only necessary source files
COPY src ./src
COPY tsconfig.json ./

# Create download and data directories
RUN mkdir -p /downloads /app/data

# Set environment variables
ENV NODE_ENV=production \
    DOWNLOAD_DIR=/downloads \
    PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/api/downloads').then(r => r.ok ? process.exit(0) : process.exit(1))" || exit 1

# Run the application
CMD ["bun", "src/index.ts"]
