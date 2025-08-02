#!/bin/bash

# EchoTune AI - Simplified Deployment Script
# Quick and easy deployment for DigitalOcean and development environments

# Load deployment utilities for consistent operations
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/deployment-utils.sh" ]; then
    source "$SCRIPT_DIR/deployment-utils.sh"
elif [ -f "../scripts/deployment-utils.sh" ]; then
    source "../scripts/deployment-utils.sh"
else
    # Fallback basic functions
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
    
    log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
    log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
    log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
    log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
    log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
    
    command_exists() { command -v "$1" >/dev/null 2>&1; }
fi

# Enable strict error handling
set -e
set -o pipefail

# Configuration with sensible defaults
APP_DIR="${APP_DIR:-/opt/echotune}"
DOMAIN="${DOMAIN:-localhost}"
PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-production}"

# Enhanced cleanup function for simple deployment
cleanup_on_error() {
    log_error "Simple deployment failed or was interrupted"
    log_info "Cleaning up partial installation..."
    
    # Stop any running Docker containers
    if command_exists docker-compose && [ -f "docker-compose.yml" ]; then
        docker-compose down --timeout 10 2>/dev/null || true
    fi
    
    echo ""
    log_error "Simple deployment was interrupted or failed"
    echo ""
    echo -e "${YELLOW}🔍 Troubleshooting Steps:${NC}"
    echo "   1. Check that Docker is running: docker ps"
    echo "   2. Verify you're in the correct directory"
    echo "   3. Check available disk space: df -h"
    echo "   4. Review logs for specific errors"
    echo ""
    echo -e "${YELLOW}💡 Common Solutions:${NC}"
    echo "   - Restart Docker: sudo systemctl restart docker"
    echo "   - Clean Docker cache: docker system prune -f"
    echo "   - Check internet connectivity"
    echo "   - Ensure proper file permissions"
    echo ""
}
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

# Check if we're in the right directory
check_directory() {
    log_step "Checking deployment directory..."
    
    # If we're not in a git repository, try to navigate to APP_DIR
    if [ ! -d ".git" ] && [ -d "$APP_DIR" ]; then
        log_info "Navigating to application directory: $APP_DIR"
        cd "$APP_DIR"
    fi
    
    # Verify we're in the correct repository
    if [ ! -f "package.json" ] || [ ! -f "docker-compose.yml" ]; then
        log_error "Required files not found. Make sure you're in the EchoTune AI directory."
        echo "Expected files: package.json, docker-compose.yml"
        echo "Current directory: $(pwd)"
        echo "Directory contents:"
        ls -la
        exit 1
    fi
    
    log_success "Found EchoTune AI project files"
}

# Simple environment detection
detect_environment() {
    log_step "Detecting environment configuration..."
    
    # Look for .env file in current directory
    if [ -f ".env" ]; then
        log_info "Found .env file in current directory"
        
        # Source the environment file
        if source .env 2>/dev/null; then
            log_success "Environment variables loaded"
        else
            log_warning "Failed to load .env file, using defaults"
        fi
    else
        log_warning "No .env file found, using defaults"
        log_info "For production deployment, please create a .env file with:"
        echo "  - SPOTIFY_CLIENT_ID=your_client_id"
        echo "  - SPOTIFY_CLIENT_SECRET=your_client_secret"
        echo "  - NODE_ENV=production"
        echo "  - DOMAIN=your-domain.com"
    fi
    
    # Set defaults for critical variables
    export NODE_ENV="${NODE_ENV:-production}"
    export PORT="${PORT:-3000}"
    export DOMAIN="${DOMAIN:-localhost}"
    
    log_info "Using configuration:"
    echo "  - NODE_ENV: $NODE_ENV"
    echo "  - PORT: $PORT"
    echo "  - DOMAIN: $DOMAIN"
    
    if [ -n "$SPOTIFY_CLIENT_ID" ]; then
        echo "  - SPOTIFY_CLIENT_ID: ${SPOTIFY_CLIENT_ID:0:8}..."
    else
        echo "  - SPOTIFY_CLIENT_ID: [Not set - chatbot will use demo mode]"
    fi
}

# Check Docker
check_docker() {
    log_step "Checking Docker availability..."
    
    if ! command_exists docker; then
        log_error "Docker is not installed"
        echo "Please install Docker first:"
        echo "  curl -fsSL https://get.docker.com | sudo sh"
        exit 1
    fi
    
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose is not installed"
        echo "Please install Docker Compose first:"
        echo "  # For Docker Compose V2 (recommended):"
        echo "  sudo apt update && sudo apt install docker-compose-plugin"
        echo "  # Or for Docker Compose V1:"
        echo "  sudo apt update && sudo apt install docker-compose"
        exit 1
    fi
    
    # Check if Docker is running with wait functionality
    if ! wait_for_docker 30; then
        log_error "Docker daemon is not running or not accessible"
        echo "Please start Docker and ensure current user has permissions:"
        echo "  sudo systemctl start docker"
        echo "  sudo usermod -aG docker \$USER"
        echo "  # Then logout and login again"
        exit 1
    fi
    
    log_success "Docker and Docker Compose are available and running"
}

# Stop existing services
stop_services() {
    log_step "Stopping existing services..."
    
    if docker-compose ps -q | grep -q .; then
        log_info "Stopping running services..."
        docker-compose down --timeout 30 || {
            log_warning "Some services may not have stopped cleanly"
        }
    else
        log_info "No running services found"
    fi
    
    log_success "Services stopped"
}

# Build and start application
build_and_start() {
    log_step "Building and starting application..."
    
    # Build the application
    log_info "Building Docker containers..."
    if ! docker-compose build; then
        log_error "Build failed"
        echo "Common solutions:"
        echo "  - Check internet connection for downloading dependencies"
        echo "  - Clear Docker cache: docker system prune -f"
        echo "  - Check disk space: df -h"
        exit 1
    fi
    
    # Start services
    log_info "Starting services..."
    if ! docker-compose up -d; then
        log_error "Failed to start services"
        echo "Checking for port conflicts..."
        netstat -tlnp 2>/dev/null | grep -E ':(80|443|3000)' || echo "No port conflicts detected"
        echo ""
        echo "Check logs for more details:"
        echo "  docker-compose logs"
        exit 1
    fi
    
    log_success "Services started"
}

# Simple health check
health_check() {
    log_step "Performing health check..."
    
    local max_retries=10
    local retry_delay=6
    local retries=0
    
    # Health check endpoints to try
    local endpoints=(
        "http://localhost:$PORT/health"
        "http://localhost:$PORT/"
        "http://127.0.0.1:$PORT/health"
        "http://127.0.0.1:$PORT/"
    )
    
    while [ $retries -lt $max_retries ]; do
        log_info "Health check attempt $((retries + 1))/$max_retries..."
        
        for endpoint in "${endpoints[@]}"; do
            if curl -f -s --connect-timeout 5 --max-time 10 "$endpoint" > /dev/null 2>&1; then
                log_success "Application is healthy at $endpoint!"
                return 0
            fi
        done
        
        retries=$((retries + 1))
        if [ $retries -lt $max_retries ]; then
            log_info "Waiting ${retry_delay}s before next check..."
            sleep $retry_delay
        fi
    done
    
    log_warning "Health check failed, but application may still be starting"
    log_info "You can check the application manually:"
    echo "  - Open browser: http://localhost:$PORT"
    echo "  - Check logs: docker-compose logs -f"
    echo "  - Check status: docker-compose ps"
    
    return 0  # Don't fail deployment on health check
}

# Display deployment summary
show_summary() {
    echo ""
    log_success "🎉 EchoTune AI deployment completed!"
    echo ""
    echo "📊 Service Status:"
    docker-compose ps
    echo ""
    echo "🌐 Application URLs:"
    if [ "$DOMAIN" = "localhost" ]; then
        echo "   - http://localhost:$PORT"
    else
        echo "   - http://$DOMAIN:$PORT"
        echo "   - http://localhost:$PORT (direct access)"
    fi
    echo ""
    echo "🔧 Management Commands:"
    echo "   - View logs: docker-compose logs -f"
    echo "   - Check status: docker-compose ps"
    echo "   - Restart: docker-compose restart"
    echo "   - Stop: docker-compose down"
    echo "   - Update: git pull && ./scripts/deploy-simple.sh"
    echo ""
    echo "📁 Important Paths:"
    echo "   - Application directory: $(pwd)"
    if [ -f ".env" ]; then
        echo "   - Environment file: $(pwd)/.env"
    fi
    echo ""
    
    # Show additional info for production
    if [ "$NODE_ENV" = "production" ]; then
        echo "🔒 Production Notes:"
        echo "   - Ensure firewall allows ports 80, 443, and $PORT"
        echo "   - Configure SSL certificates for HTTPS"
        echo "   - Set up monitoring and backups"
        echo "   - Review security settings"
        echo ""
    fi
}

# Main deployment function
main() {
    echo "🚀 EchoTune AI - Simplified Deployment"
    echo "====================================="
    echo ""
    
    # Set error handler
    trap cleanup_on_error ERR INT TERM
    
    check_directory
    detect_environment
    check_docker
    stop_services
    build_and_start
    health_check
    
    # Clear error trap on success
    trap - ERR INT TERM
    
    show_summary
}

# Handle script interruption  
trap 'cleanup_on_error; exit 1' INT TERM

# Run main function
main "$@"