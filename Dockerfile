# Production Dockerfile for EchoTune AI
FROM node:18-alpine AS base

# Install Python and build dependencies for Python packages
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    py3-setuptools \
    py3-wheel \
    py3-numpy \
    py3-pandas \
    py3-scipy \
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

# Copy package files
COPY package*.json ./
COPY requirements-production.txt ./

# Install Node.js dependencies
RUN npm ci --only=production

# Create Python virtual environment and install dependencies
RUN python3 -m venv /app/venv && \
    . /app/venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements-production.txt

# Add virtual environment to PATH
ENV PATH="/app/venv/bin:$PATH"

# Copy application code
COPY src/ ./src/
COPY public/ ./public/
COPY mcp-server/ ./mcp-server/
COPY scripts/ ./scripts/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S echotune -u 1001

# Change ownership of the app directory
RUN chown -R echotune:nodejs /app
USER echotune

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "src/index.js"]