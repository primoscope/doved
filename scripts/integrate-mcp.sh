#!/bin/bash

# EchoTune AI - Enhanced MCP Server Integration
# Integrates Model Context Protocol server with the main application

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MCP_PORT="${MCP_PORT:-3001}"
APP_PORT="${APP_PORT:-3000}"
MCP_DIR="mcp-server"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check MCP server setup
check_mcp_setup() {
    log_step "Checking MCP server setup..."
    
    if [ ! -d "$MCP_DIR" ]; then
        log_error "MCP server directory not found: $MCP_DIR"
        exit 1
    fi
    
    cd "$MCP_DIR"
    
    if [ ! -f "package.json" ]; then
        log_error "MCP server package.json not found"
        exit 1
    fi
    
    log_success "MCP server directory found"
}

# Install MCP dependencies
install_mcp_dependencies() {
    log_step "Installing MCP server dependencies..."
    
    cd "$MCP_DIR"
    
    # Install Node.js dependencies
    if [ -f "package.json" ]; then
        log_info "Installing Node.js dependencies..."
        npm ci
    fi
    
    # Install Python dependencies
    if [ -f "requirements.txt" ]; then
        log_info "Installing Python dependencies..."
        pip3 install -r requirements.txt
    fi
    
    log_success "MCP dependencies installed"
    cd ..
}

# Create MCP integration configuration
create_mcp_config() {
    log_step "Creating MCP integration configuration..."
    
    # Update docker-compose.yml to include MCP server
    if [ -f "docker-compose.yml" ]; then
        # Check if MCP service already exists
        if ! grep -q "mcp-server:" docker-compose.yml; then
            log_info "Adding MCP server to docker-compose.yml..."
            
            # Create backup
            cp docker-compose.yml docker-compose.yml.backup
            
            # Add MCP service
            cat >> docker-compose.yml <<EOF

  mcp-server:
    build: ./mcp-server
    ports:
      - "${MCP_PORT}:${MCP_PORT}"
    environment:
      - NODE_ENV=production
      - MCP_PORT=${MCP_PORT}
      - APP_PORT=${APP_PORT}
    env_file:
      - .env
    restart: unless-stopped
    networks:
      - echotune-network
    depends_on:
      - app
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${MCP_PORT}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF
            log_success "MCP server added to docker-compose.yml"
        else
            log_success "MCP server already configured in docker-compose.yml"
        fi
    fi
}

# Create MCP Dockerfile if needed
create_mcp_dockerfile() {
    log_step "Checking MCP Dockerfile..."
    
    if [ ! -f "$MCP_DIR/Dockerfile" ]; then
        log_info "Creating MCP Dockerfile..."
        
        cat > "$MCP_DIR/Dockerfile" <<EOF
FROM node:20-alpine

# Install Python for Python-based MCP tools
RUN apk add --no-cache python3 py3-pip chromium

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Install Python dependencies if they exist
RUN if [ -f requirements.txt ]; then pip3 install -r requirements.txt; fi

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["npm", "start"]
EOF
        log_success "MCP Dockerfile created"
    else
        log_success "MCP Dockerfile already exists"
    fi
}

# Update MCP package.json
update_mcp_package() {
    log_step "Updating MCP package.json..."
    
    cd "$MCP_DIR"
    
    # Check if package.json exists and has start script
    if [ -f "package.json" ]; then
        # Add health endpoint script if not exists
        if ! grep -q '"health"' package.json; then
            log_info "Adding health check script to MCP package.json..."
            
            # Use jq if available, otherwise use sed
            if command -v jq &> /dev/null; then
                jq '.scripts.health = "curl -f http://localhost:3001/health || exit 1"' package.json > package.json.tmp && mv package.json.tmp package.json
            else
                # Fallback to manual addition
                sed -i '/"scripts": {/a\    "health": "curl -f http://localhost:3001/health || exit 1",' package.json
            fi
        fi
        log_success "MCP package.json updated"
    else
        log_warning "MCP package.json not found"
    fi
    
    cd ..
}

# Create health endpoint for MCP server
create_mcp_health_endpoint() {
    log_step "Creating MCP health endpoint..."
    
    if [ ! -f "$MCP_DIR/health.js" ]; then
        log_info "Creating MCP health endpoint..."
        
        cat > "$MCP_DIR/health.js" <<'EOF'
// MCP Server Health Check Endpoint
const express = require('express');
const app = express();
const port = process.env.MCP_PORT || 3001;

// Health check endpoint
app.get('/health', (req, res) => {
    const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'mcp-server',
        version: require('./package.json').version || '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(healthStatus);
});

// Basic info endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'EchoTune AI - MCP Server',
        status: 'running',
        endpoints: ['/health', '/mcp', '/spotify'],
        documentation: 'https://github.com/dzp5103/Spotify-echo'
    });
});

// Start server if this file is run directly
if (require.main === module) {
    app.listen(port, () => {
        console.log(`MCP Health server running on port ${port}`);
    });
}

module.exports = app;
EOF
        log_success "MCP health endpoint created"
    else
        log_success "MCP health endpoint already exists"
    fi
}

# Update main application to include MCP integration
update_main_app_integration() {
    log_step "Updating main application MCP integration..."
    
    # Check if MCP integration exists in main app
    if [ -f "src/services/mcp-client.js" ]; then
        log_success "MCP client already exists"
    else
        log_info "Creating MCP client integration..."
        
        mkdir -p src/services
        
        cat > src/services/mcp-client.js <<'EOF'
// MCP Client Integration for EchoTune AI
const axios = require('axios');

class MCPClient {
    constructor(mcpUrl = 'http://localhost:3001') {
        this.mcpUrl = mcpUrl;
        this.timeout = 10000;
    }

    async isHealthy() {
        try {
            const response = await axios.get(`${this.mcpUrl}/health`, {
                timeout: this.timeout
            });
            return response.status === 200;
        } catch (error) {
            console.warn('MCP server health check failed:', error.message);
            return false;
        }
    }

    async executeAction(action, params = {}) {
        try {
            const response = await axios.post(`${this.mcpUrl}/mcp/execute`, {
                action,
                params
            }, {
                timeout: this.timeout
            });
            return response.data;
        } catch (error) {
            console.error('MCP action execution failed:', error.message);
            throw new Error(`MCP action failed: ${error.message}`);
        }
    }

    async spotifyAction(action, params = {}) {
        try {
            const response = await axios.post(`${this.mcpUrl}/spotify`, {
                action,
                params
            }, {
                timeout: this.timeout
            });
            return response.data;
        } catch (error) {
            console.error('MCP Spotify action failed:', error.message);
            throw new Error(`MCP Spotify action failed: ${error.message}`);
        }
    }

    async getStatus() {
        try {
            const response = await axios.get(`${this.mcpUrl}/`, {
                timeout: this.timeout
            });
            return response.data;
        } catch (error) {
            console.error('Failed to get MCP status:', error.message);
            return { status: 'unavailable' };
        }
    }
}

module.exports = MCPClient;
EOF
        log_success "MCP client integration created"
    fi
}

# Test MCP integration
test_mcp_integration() {
    log_step "Testing MCP integration..."
    
    # Start services if not running
    if ! docker-compose ps -q | grep -q .; then
        log_info "Starting services for testing..."
        docker-compose up -d --build
        sleep 10
    fi
    
    # Test MCP server health
    local mcp_healthy=false
    local retries=5
    local retry_count=0
    
    while [ $retry_count -lt $retries ]; do
        if curl -f -s "http://localhost:$MCP_PORT/health" > /dev/null 2>&1; then
            mcp_healthy=true
            break
        fi
        retry_count=$((retry_count + 1))
        sleep 2
    done
    
    if [ "$mcp_healthy" = true ]; then
        log_success "MCP server is healthy and responding"
    else
        log_warning "MCP server health check failed"
        log_info "Check MCP server logs: docker-compose logs mcp-server"
    fi
    
    # Test main app can connect to MCP
    if curl -f -s "http://localhost:$APP_PORT/health" > /dev/null 2>&1; then
        log_success "Main application is healthy"
    else
        log_warning "Main application health check failed"
    fi
}

# Display integration summary
show_integration_summary() {
    echo ""
    log_success "🎉 MCP Server Integration Completed!"
    echo ""
    echo "📊 Services Status:"
    docker-compose ps
    echo ""
    echo "🔗 Integration Endpoints:"
    echo "   - Main App: http://localhost:$APP_PORT"
    echo "   - MCP Server: http://localhost:$MCP_PORT"
    echo "   - MCP Health: http://localhost:$MCP_PORT/health"
    echo ""
    echo "🔧 Management Commands:"
    echo "   - View all logs: docker-compose logs -f"
    echo "   - View MCP logs: docker-compose logs -f mcp-server"
    echo "   - Restart MCP: docker-compose restart mcp-server"
    echo "   - Test MCP health: curl http://localhost:$MCP_PORT/health"
    echo ""
    echo "📁 Integration Files:"
    echo "   - MCP Client: src/services/mcp-client.js"
    echo "   - MCP Health: $MCP_DIR/health.js"
    echo "   - MCP Dockerfile: $MCP_DIR/Dockerfile"
    echo ""
}

# Main integration function
main() {
    echo "🤖 EchoTune AI - MCP Server Integration"
    echo "======================================"
    echo ""
    
    check_mcp_setup
    install_mcp_dependencies
    create_mcp_dockerfile
    update_mcp_package
    create_mcp_health_endpoint
    create_mcp_config
    update_main_app_integration
    test_mcp_integration
    show_integration_summary
}

# Run main function
main "$@"