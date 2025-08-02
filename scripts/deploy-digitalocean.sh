#!/bin/bash

# EchoTune AI - DigitalOcean Quick Deploy Script
# One-command deployment specifically optimized for DigitalOcean droplets

# Load deployment utilities for consistent operations
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/deployment-utils.sh" ]; then
    source "$SCRIPT_DIR/deployment-utils.sh"
elif [ -f "scripts/deployment-utils.sh" ]; then
    source "scripts/deployment-utils.sh"
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
    
    install_packages_apt() {
        export DEBIAN_FRONTEND=noninteractive
        sudo apt-get update -qq
        sudo apt-get install -y -qq "$@"
    }
    
    add_user_to_group() {
        local username="${1:-$USER}"
        local group="$2"
        sudo usermod -aG "$group" "$username"
    }
    
    command_exists() { command -v "$1" >/dev/null 2>&1; }
fi

# Enable strict error handling
set -e
set -o pipefail

# DigitalOcean optimized configuration
APP_DIR="/opt/echotune"
DOMAIN="${DOMAIN:-$(curl -s http://ipinfo.io/ip).nip.io}"  # Use IP-based domain if none set
REPO_URL="https://github.com/dzp5103/Spotify-echo.git"

# Enhanced cleanup function
cleanup_on_error() {
    log_error "Deployment failed during DigitalOcean setup"
    log_info "Cleaning up partial installation..."
    
    # Stop any running Docker containers
    if command_exists docker-compose && [ -f "docker-compose.yml" ]; then
        docker-compose down --timeout 10 2>/dev/null || true
    fi
    
    # Clean up temporary files
    rm -f /tmp/digitalocean-deploy-* 2>/dev/null || true
    
    echo ""
    log_error "DigitalOcean deployment was interrupted or failed"
    echo ""
    echo -e "${YELLOW}🔍 Troubleshooting Steps:${NC}"
    echo "   1. Check system requirements and internet connectivity"
    echo "   2. Verify DigitalOcean droplet has sufficient resources"
    echo "   3. Check available disk space: df -h"
    echo "   4. Review logs for specific errors"
    echo ""
    echo -e "${YELLOW}💡 Common Solutions:${NC}"
    echo "   - Restart Docker: sudo systemctl restart docker"
    echo "   - Update packages: sudo apt update && sudo apt upgrade"
    echo "   - Check network: ping 8.8.8.8"
    echo "   - Free disk space: docker system prune -f"
    echo ""
    echo -e "${CYAN}📚 Get Help:${NC}"
    echo "   - GitHub Issues: https://github.com/dzp5103/Spotify-echo/issues"
    echo "   - Documentation: https://github.com/dzp5103/Spotify-echo#readme"
    echo ""
}

# Check if running on DigitalOcean
check_digitalocean() {
    log_step "Detecting DigitalOcean environment..."
    
    # Check for DigitalOcean metadata service
    if curl -s --connect-timeout 2 --max-time 5 http://169.254.169.254/metadata/v1/id &>/dev/null; then
        DROPLET_ID=$(curl -s http://169.254.169.254/metadata/v1/id)
        PUBLIC_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address)
        log_success "Running on DigitalOcean droplet (ID: $DROPLET_ID, IP: $PUBLIC_IP)"
        
        # Use IP-based domain if none provided
        if [ "$DOMAIN" = "$(curl -s http://ipinfo.io/ip).nip.io" ]; then
            DOMAIN="${PUBLIC_IP}.nip.io"
            log_info "Using IP-based domain: $DOMAIN"
        fi
    else
        log_warning "Not running on DigitalOcean or metadata service unavailable"
        log_info "Continuing with standard deployment..."
    fi
}

# Quick system setup for DigitalOcean
quick_system_setup() {
    log_step "Quick system setup for DigitalOcean..."
    
    # Install required packages with robust error handling
    local packages=(curl wget git docker.io docker-compose python3 python3-pip nodejs npm)
    if ! install_packages_apt "${packages[@]}"; then
        log_error "Failed to install required system packages"
        log_info "This could be due to:"
        log_info "1. Network connectivity issues"
        log_info "2. Package repository problems" 
        log_info "3. Insufficient disk space"
        log_info "4. Permission issues"
        log_info ""
        log_info "Try these solutions:"
        log_info "- Check internet connection: ping 8.8.8.8"
        log_info "- Update package lists: sudo apt update"
        log_info "- Check disk space: df -h"
        log_info "- Check package availability: apt search docker.io"
        exit 1
    fi
    
    # Start and enable Docker with error handling
    if ! sudo systemctl start docker 2>/dev/null; then
        log_warning "Failed to start Docker service, attempting reset"
        sudo systemctl restart docker || {
            log_error "Docker service failed to start"
            log_info "Docker installation may be incomplete or corrupted."
            log_info "Try these solutions:"
            log_info "- Reinstall Docker: curl -fsSL https://get.docker.com | sh"
            log_info "- Check Docker status: sudo systemctl status docker"
            log_info "- Check Docker logs: sudo journalctl -u docker"
            exit 1
        }
    fi
    
    sudo systemctl enable docker
    
    # Add user to docker group safely
    add_user_to_group "$USER" "docker"
    
    # Basic firewall setup with error handling
    if command_exists ufw; then
        sudo ufw --force enable 2>/dev/null || log_warning "Failed to enable firewall"
        sudo ufw allow ssh 2>/dev/null || log_warning "Failed to allow SSH in firewall"
        sudo ufw allow 80/tcp 2>/dev/null || log_warning "Failed to allow port 80 in firewall"
        sudo ufw allow 443/tcp 2>/dev/null || log_warning "Failed to allow port 443 in firewall"
        sudo ufw allow 3000/tcp 2>/dev/null || log_warning "Failed to allow port 3000 in firewall"
        log_success "Basic firewall configured"
    else
        log_warning "UFW not available, skipping firewall configuration"
    fi
    
    log_success "Basic system setup completed"
}

# Setup application directory
setup_app_directory() {
    log_step "Setting up application directory..."
    
    # Create app directory if it doesn't exist
    if [ ! -d "$APP_DIR" ]; then
        sudo mkdir -p "$APP_DIR"
        sudo chown "$USER:$USER" "$APP_DIR"
    fi
    
    # Navigate to app directory
    cd "$APP_DIR"
    
    # Check if we're already in the correct directory with a git repository
    if [ -d ".git" ]; then
        log_info "Found existing git repository"
        
        # Verify it's the correct repository
        local current_remote
        current_remote=$(git remote get-url origin 2>/dev/null || echo "")
        
        if [[ "$current_remote" == *"Spotify-echo"* ]] || [[ "$current_remote" == "$REPO_URL" ]]; then
            log_success "Repository verified: $current_remote"
            log_info "Updating repository..."
            if git pull origin main 2>/dev/null; then
                log_success "Repository updated"
            else
                log_warning "Could not update repository, continuing with current version"
            fi
            return 0
        else
            log_error "Directory contains wrong git repository: $current_remote"
            log_error "Expected: $REPO_URL"
            log_error "Please remove $APP_DIR and run setup again"
            exit 1
        fi
    fi
    
    # Check if directory exists but is not a git repository
    if [ -n "$(find . -maxdepth 1 -type f -print -quit 2>/dev/null)" ]; then
        log_error "Directory $APP_DIR exists but is not a git repository"
        log_error "Found existing files in the directory"
        log_info "Please either:"
        log_info "1. Remove the directory: sudo rm -rf $APP_DIR"
        log_info "2. Move existing files to backup location"
        log_info "3. Initialize as git repository manually"
        exit 1
    fi
    
    # Directory is empty or doesn't exist, safe to clone
    log_info "Cloning repository from $REPO_URL..."
    
    if ! git clone "$REPO_URL" .; then
        log_error "Failed to clone repository from $REPO_URL"
        log_info "This could be due to:"
        log_info "1. Network connectivity issues"
        log_info "2. Invalid repository URL"
        log_info "3. Permission issues (if private repository)"
        log_info "4. Git not installed"
        log_info ""
        log_info "Please verify:"
        log_info "- Internet connection is working"
        log_info "- Repository URL is correct: $REPO_URL"
        log_info "- Git is installed: git --version"
        log_info "- Repository is accessible"
        exit 1
    fi
    
    log_success "Application directory ready"
}

# Create minimal environment configuration
create_environment() {
    log_step "Creating environment configuration..."
    
    cd "$APP_DIR"
    
    if [ ! -f ".env" ]; then
        log_info "Creating production .env file..."
        
        # Generate secure secrets
        SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "please_change_this_session_secret_$(date +%s)")
        JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "please_change_this_jwt_secret_$(date +%s)")
        
        cat > .env <<EOF
# EchoTune AI - DigitalOcean Production Configuration
NODE_ENV=production
PORT=3000
DOMAIN=$DOMAIN
FRONTEND_URL=https://$DOMAIN

# Spotify API Configuration (REQUIRED - Please update with your credentials)
SPOTIFY_CLIENT_ID=\${SPOTIFY_CLIENT_ID:-your_spotify_client_id_here}
SPOTIFY_CLIENT_SECRET=\${SPOTIFY_CLIENT_SECRET:-your_spotify_client_secret_here}
SPOTIFY_REDIRECT_URI=https://$DOMAIN/auth/callback

# Security Configuration (Auto-generated secure secrets)
SESSION_SECRET=$SESSION_SECRET
JWT_SECRET=$JWT_SECRET

# LLM Provider Configuration (Optional - Demo mode if not configured)
DEFAULT_LLM_PROVIDER=mock
GEMINI_API_KEY=\${GEMINI_API_KEY:-}
OPENAI_API_KEY=\${OPENAI_API_KEY:-}

# Database Configuration (Optional - SQLite fallback if not configured)
MONGODB_URI=\${MONGODB_URI:-}
SUPABASE_URL=\${SUPABASE_URL:-}
SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY:-}

# Production Settings
LOG_LEVEL=info
DEBUG=false
TRUST_PROXY=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
ENABLE_CORS=true
CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN

# Health Check Configuration
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=true
EOF
        
        log_success "Production .env file created with secure defaults"
        log_warning "IMPORTANT: Update Spotify credentials in $APP_DIR/.env before production use"
        
        # Create environment validation script
        cat > validate-env.sh <<'EOF'
#!/bin/bash
# Environment validation script

MISSING_VARS=""

check_var() {
    local var_name="$1"
    local var_value="${!var_name}"
    local is_required="$2"
    
    if [ -z "$var_value" ] || [ "$var_value" = "your_spotify_client_id_here" ] || [ "$var_value" = "your_spotify_client_secret_here" ]; then
        if [ "$is_required" = "true" ]; then
            MISSING_VARS="$MISSING_VARS $var_name"
        fi
    fi
}

# Load environment variables
set -a
source .env
set +a

# Check required variables
check_var "SPOTIFY_CLIENT_ID" "true"
check_var "SPOTIFY_CLIENT_SECRET" "true"

if [ -n "$MISSING_VARS" ]; then
    echo "❌ Missing required environment variables:$MISSING_VARS"
    echo ""
    echo "Please update the following in .env file:"
    for var in $MISSING_VARS; do
        echo "  $var=your_actual_value_here"
    done
    echo ""
    echo "Get Spotify credentials from: https://developer.spotify.com/dashboard"
    exit 1
else
    echo "✅ Environment validation passed"
    exit 0
fi
EOF
        chmod +x validate-env.sh
        
    else
        log_success "Using existing .env file"
        
        # Update domain if needed
        sed -i "s|DOMAIN=.*|DOMAIN=$DOMAIN|" .env
        sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://$DOMAIN|" .env
        sed -i "s|SPOTIFY_REDIRECT_URI=.*|SPOTIFY_REDIRECT_URI=https://$DOMAIN/auth/callback|" .env
        
        log_info "Updated domain settings in .env"
    fi
}

# Install dependencies
install_dependencies() {
    log_step "Installing application dependencies..."
    
    cd "$APP_DIR"
    
    # Install Node.js dependencies
    if [ -f "package.json" ]; then
        log_info "Installing Node.js dependencies..."
        npm ci --only=production --silent
    fi
    
    # Install Python dependencies if needed
    if [ -f "requirements.txt" ]; then
        log_info "Installing Python dependencies..."
        pip3 install -r requirements.txt --quiet
    fi
    
    log_success "Dependencies installed"
}

# Deploy with Docker
deploy_application() {
    log_step "Deploying application with Docker..."
    
    cd "$APP_DIR"
    
    # Stop existing services
    if docker-compose ps -q 2>/dev/null | grep -q .; then
        log_info "Stopping existing services..."
        docker-compose down --timeout 10
    fi
    
    # Build and start services
    log_info "Building and starting services..."
    docker-compose up -d --build
    
    log_success "Application deployed"
}

# Quick health check
verify_deployment() {
    log_step "Verifying deployment..."
    
    local max_retries=15
    local retry_delay=4
    local retries=0
    
    while [ $retries -lt $max_retries ]; do
        log_info "Checking application status ($((retries + 1))/$max_retries)..."
        
        if curl -f -s --connect-timeout 3 --max-time 10 "http://localhost:3000/" > /dev/null 2>&1; then
            log_success "Application is running and accessible!"
            return 0
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $max_retries ]; then
            sleep $retry_delay
        fi
    done
    
    log_warning "Application may still be starting up"
    log_info "Check manually: docker-compose logs -f"
    return 0
}

# Display final information
show_deployment_info() {
    echo ""
    log_success "🎉 DigitalOcean deployment completed!"
    echo ""
    echo "📊 Application Status:"
    cd "$APP_DIR" && docker-compose ps
    echo ""
    echo "🌐 Access URLs:"
    echo "   - Public: http://$DOMAIN:3000"
    echo "   - Direct: http://localhost:3000"
    if [ -n "$PUBLIC_IP" ]; then
        echo "   - IP: http://$PUBLIC_IP:3000"
    fi
    echo ""
    echo "🔧 Management Commands:"
    echo "   cd $APP_DIR"
    echo "   docker-compose logs -f    # View logs"
    echo "   docker-compose restart    # Restart services"
    echo "   docker-compose down       # Stop services"
    echo ""
    echo "⚙️ Configuration:"
    echo "   - Environment: $APP_DIR/.env"
    echo "   - Logs: docker-compose logs"
    echo ""
    echo "🔒 Security Reminders:"
    echo "   - Update Spotify credentials in .env file"
    echo "   - Configure proper SSL certificates for production"
    echo "   - Set up regular backups"
    echo "   - Review firewall settings"
    echo ""
    
    if [ -n "$PUBLIC_IP" ]; then
        echo "🌍 Your EchoTune AI is now accessible at:"
        echo "   http://$PUBLIC_IP:3000"
        echo ""
    fi
}

# Handle errors
handle_error() {
    log_error "Deployment failed!"
    echo ""
    echo "🔍 Troubleshooting:"
    echo "   - Check system requirements (Docker, Git, etc.)"
    echo "   - Verify internet connectivity"
    echo "   - Check disk space: df -h"
    echo "   - View Docker logs: docker-compose logs"
    echo "   - Check running services: docker-compose ps"
    echo ""
    echo "💡 Common solutions:"
    echo "   - Restart Docker: sudo systemctl restart docker"
    echo "   - Clear Docker cache: docker system prune -f"
    echo "   - Update system: sudo apt update && sudo apt upgrade"
    echo ""
    exit 1
}

# Validate environment configuration
validate_environment() {
    log_step "Validating environment configuration..."
    
    cd "$APP_DIR"
    
    if [ -f "validate-env.sh" ]; then
        log_info "Running environment validation..."
        if ./validate-env.sh; then
            log_success "Environment validation passed"
        else
            log_error "Environment validation failed"
            echo ""
            echo "🔧 To fix this:"
            echo "1. Edit the .env file: nano $APP_DIR/.env"
            echo "2. Get Spotify credentials: https://developer.spotify.com/dashboard"
            echo "3. Update SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET"
            echo "4. Re-run deployment: $0"
            echo ""
            log_warning "Continuing with demo mode (limited functionality)"
            sleep 3
        fi
    else
        log_warning "Environment validation script not found"
    fi
}

# Main deployment function
main() {
    echo "🚀 EchoTune AI - DigitalOcean Quick Deploy"
    echo "========================================="
    echo ""
    
    # Set error handler
    trap cleanup_on_error ERR INT TERM
    
    check_digitalocean
    quick_system_setup
    setup_app_directory
    create_environment
    validate_environment
    install_dependencies
    deploy_application
    verify_deployment
    
    # Clear error trap on success
    trap - ERR INT TERM
    
    show_deployment_info
}

# Handle errors (kept for backward compatibility)
handle_error() {
    cleanup_on_error
    exit 1
}

# Run main function
main "$@"