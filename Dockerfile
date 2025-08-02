# Production Dockerfile for EchoTune AI
# Multi-stage build optimized for security and performance

# =============================================================================
# Build Stage
# =============================================================================
FROM node:18-alpine AS builder

# Install build dependencies for Python packages
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    py3-setuptools \
    py3-wheel \
    make \
    g++ \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev \
    lapack-dev \
    gfortran \
    pkgconfig \
    cmake

# Set working directory
WORKDIR /app

# Copy package files for caching
COPY package*.json ./
COPY requirements-production.txt ./

# Install Node.js dependencies
RUN npm ci --only=production --no-audit --no-fund

# Create Python virtual environment and install dependencies
RUN python3 -m venv /app/venv && \
    . /app/venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements-production.txt

# =============================================================================
# Production Stage
# =============================================================================
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create app directory and user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S echotune -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /app/venv /app/venv

# Add virtual environment to PATH
ENV PATH="/app/venv/bin:$PATH"

# Copy Node.js dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=echotune:nodejs src/ ./src/
COPY --chown=echotune:nodejs public/ ./public/
COPY --chown=echotune:nodejs mcp-server/ ./mcp-server/
COPY --chown=echotune:nodejs scripts/ ./scripts/
COPY --chown=echotune:nodejs package*.json ./

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs /app/uploads /app/temp /var/log && \
    chown -R echotune:nodejs /app /var/log

# Switch to non-root user
USER echotune

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/index.js"]