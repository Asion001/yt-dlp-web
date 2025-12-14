# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend assets
RUN bun run build.ts

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Install yt-dlp and ffmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install --no-cache-dir yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies only
COPY package.json bun.lockb* ./
RUN bun install --production --frozen-lockfile

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Create download directory
RUN mkdir -p /downloads

# Set environment variables
ENV NODE_ENV=production
ENV DOWNLOAD_DIR=/downloads
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/api/downloads').then(r => r.ok ? process.exit(0) : process.exit(1))" || exit 1

# Run the application
CMD ["bun", "src/index.ts"]
