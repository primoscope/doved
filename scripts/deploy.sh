#!/bin/bash

# EchoTune AI - Enhanced Production Deployment Script
# Comprehensive deployment with environment validation, SSL, monitoring, and security

# Load deployment utilities for consistent operations
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/deployment-utils.sh" ]; then
    source "$SCRIPT_DIR/deployment-utils.sh"
elif [ -f "scripts/deployment-utils.sh" ]; then
    source "scripts/deployment-utils.sh"
else
    echo "Warning: deployment-utils.sh not found, using basic functions"
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
    
    exit_with_help() {
        local error_message="$1"
        local help_text="$2"
        echo ""
        log_error "$error_message"
        echo ""
        if [ -n "$help_text" ]; then
            echo -e "${YELLOW}💡 Helpful guidance:${NC}"
            echo "$help_text"
            echo ""
        fi
        exit 1
    }
fi

# Enable strict error handling
set -e
set -o pipefail

# Configuration
APP_DIR="/opt/echotune"
LOG_DIR="${APP_DIR}/logs"
BACKUP_DIR="${APP_DIR}/backups"
SSL_DIR="${APP_DIR}/ssl"
DOMAIN="${DOMAIN:-primosphere.studio}"
REPO_URL="${REPO_URL:-https://github.com/dzp5103/Spotify-echo.git}"
HEALTH_ENDPOINT="http://localhost:3000/health"
MAX_HEALTH_RETRIES=5
HEALTH_RETRY_DELAY=10

# Helper functions
detect_and_source_env() {
    local env_file=""
    local env_locations=(
        ".env"
        "/opt/echotune/.env"
        "$(pwd)/.env"
        "${APP_DIR}/.env"
    )
    
    log_info "Detecting and sourcing environment configuration..."
    
    # Try to find .env file in priority order
    for location in "${env_locations[@]}"; do
        if [ -f "$location" ] && [ -r "$location" ]; then
            env_file="$location"
            log_info "Found environment file: $env_file"
            break
        fi
    done
    
    if [ -n "$env_file" ]; then
        # Test environment file syntax before sourcing
        if ! bash -n "$env_file" 2>/dev/null; then
            exit_with_help "Environment file has syntax errors: $env_file" \
                "Environment file contains bash syntax errors.
Please check:
1. File syntax is correct (no invalid bash syntax)
2. Quotes are properly closed
3. No special characters that need escaping

You can test the file manually: bash -n $env_file"
        fi
        
        # Source environment file safely with error handling
        if ! (set -a; source "$env_file" 2>/dev/null; set +a); then
            exit_with_help "Failed to load environment file: $env_file" \
                "Environment file exists but failed to load.
Please check:
1. File permissions allow reading: chmod 644 $env_file
2. No special characters in values that need escaping
3. All variables are properly formatted

You can test the file manually: source $env_file"
        fi
        
        # Re-source for the current shell with validation
        set -a
        if ! source "$env_file" 2>/dev/null; then
            set +a
            exit_with_help "Failed to source environment file: $env_file" \
                "Unable to load environment variables from file.
This may be due to:
1. Invalid variable assignments
2. Special characters in values
3. Missing quotes around values with spaces

Please validate your .env file format."
        fi
        set +a
        
        log_success "Environment variables loaded from $env_file"
        
        # Export key variables for services with validation
        export NODE_ENV="${NODE_ENV:-production}"
        export PORT="${PORT:-3000}"
        export DOMAIN="${DOMAIN:-localhost}"
        
        # Validate critical variables are not empty
        if [ -n "$SPOTIFY_CLIENT_ID" ]; then
            export SPOTIFY_CLIENT_ID
        fi
        if [ -n "$SPOTIFY_CLIENT_SECRET" ]; then
            export SPOTIFY_CLIENT_SECRET
        fi
        if [ -n "$FRONTEND_URL" ]; then
            export FRONTEND_URL
        fi
        if [ -n "$SPOTIFY_REDIRECT_URI" ]; then
            export SPOTIFY_REDIRECT_URI
        fi
        if [ -n "$MONGODB_URI" ]; then
            export MONGODB_URI
        fi
        if [ -n "$REDIS_URL" ]; then
            export REDIS_URL
        fi
        
        return 0
    else
        log_error "No .env file found in any of the expected locations:"
        for location in "${env_locations[@]}"; do
            if [ -f "$location" ] && [ ! -r "$location" ]; then
                echo "  - $location (exists but not readable - check permissions)"
            else
                echo "  - $location"
            fi
        done
        return 1
    fi
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

exit_with_help() {
    local error_message="$1"
    local help_text="$2"
    
    echo ""
    log_error "$error_message"
    echo ""
    if [ -n "$help_text" ]; then
        echo -e "${YELLOW}💡 Helpful guidance:${NC}"
        echo "$help_text"
        echo ""
    fi
    
    echo -e "${YELLOW}📚 For more help:${NC}"
    echo "  - Check the deployment documentation: DIGITALOCEAN_DEPLOYMENT.md"
    echo "  - Review environment setup: .env.example or .env.production.example"
    echo "  - Verify prerequisites are installed (Docker, Node.js, etc.)"
    echo "  - Check logs in: $LOG_DIR"
    echo ""
    exit 1
}

check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_error "Please do not run this script as root"
        exit 1
    fi
}

validate_environment() {
    log_info "Validating environment configuration..."
    
    local required_vars=(
        "SPOTIFY_CLIENT_ID"
        "SPOTIFY_CLIENT_SECRET"
        "NODE_ENV"
        "PORT"
    )
    
    local missing_vars=()
    local warning_vars=()
    
    # Check required variables
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    # Check for common misconfigurations
    if [ -n "$SPOTIFY_CLIENT_ID" ] && [[ ! "$SPOTIFY_CLIENT_ID" =~ ^[a-f0-9]{32}$ ]]; then
        warning_vars+=("SPOTIFY_CLIENT_ID format looks suspicious")
    fi
    
    if [ -n "$SPOTIFY_CLIENT_SECRET" ] && [[ ! "$SPOTIFY_CLIENT_SECRET" =~ ^[a-f0-9]{32}$ ]]; then
        warning_vars+=("SPOTIFY_CLIENT_SECRET format looks suspicious")
    fi
    
    if [ "$NODE_ENV" != "production" ] && [ "$NODE_ENV" != "development" ]; then
        warning_vars+=("NODE_ENV should be 'production' or 'development', got: $NODE_ENV")
    fi
    
    if [[ "$FRONTEND_URL" == *"localhost"* ]] && [ "$NODE_ENV" = "production" ]; then
        warning_vars+=("FRONTEND_URL contains localhost but NODE_ENV is production")
    fi
    
    # Report missing variables
    if [ ${#missing_vars[@]} -ne 0 ]; then
        local missing_list=""
        for var in "${missing_vars[@]}"; do
            missing_list="$missing_list\n  - $var"
        done
        
        exit_with_help "Missing required environment variables:$missing_list" \
            "Please update your .env file with the missing variables.
You can find examples in .env.example or .env.production.example.

Common setup steps:
1. Copy template: cp .env.example .env
2. Edit file: nano .env
3. Set your Spotify credentials from https://developer.spotify.com/
4. Verify all required variables are set"
    fi
    
    # Report warnings
    if [ ${#warning_vars[@]} -ne 0 ]; then
        log_warning "Environment configuration warnings:"
        for warning in "${warning_vars[@]}"; do
            echo "  - $warning"
        done
        echo ""
    fi
    
    # Display current configuration (with sensitive data masked)
    log_info "Current environment configuration:"
    echo "  - NODE_ENV: $NODE_ENV"
    echo "  - PORT: $PORT"
    echo "  - DOMAIN: ${DOMAIN:-[Not set]}"
    echo "  - FRONTEND_URL: ${FRONTEND_URL:-[Not set]}"
    echo "  - SPOTIFY_CLIENT_ID: ${SPOTIFY_CLIENT_ID:0:8}..."
    echo "  - SPOTIFY_CLIENT_SECRET: ${SPOTIFY_CLIENT_SECRET:0:8}..."
    echo "  - SPOTIFY_REDIRECT_URI: ${SPOTIFY_REDIRECT_URI:-[Not set]}"
    
    if [ -n "$MONGODB_URI" ]; then
        echo "  - MONGODB_URI: [Configured]"
    else
        echo "  - MONGODB_URI: [Not set]"
    fi
    
    if [ -n "$REDIS_URL" ]; then
        echo "  - REDIS_URL: [Configured]"
    else
        echo "  - REDIS_URL: [Not set]"
    fi
    
    log_success "Environment validation passed"
}

setup_directories() {
    log_step "Setting up application directories..."
    
    # Ensure parent directory exists and is accessible
    if [ ! -d "$(dirname "$APP_DIR")" ]; then
        create_directory_safe "$(dirname "$APP_DIR")" "root" "755"
    fi
    
    # Create app directory if it doesn't exist using utility function
    create_directory_safe "$APP_DIR" "$USER" "755"
    
    # Create necessary subdirectories with proper error handling
    local dirs_to_create=("$LOG_DIR" "$BACKUP_DIR" "$SSL_DIR")
    for dir in "${dirs_to_create[@]}"; do
        local permissions="755"
        if [[ "$dir" == *"ssl"* ]]; then
            permissions="700"  # More restrictive for SSL directory
        fi
        create_directory_safe "$dir" "$USER" "$permissions"
    done
    
    log_success "Directories configured"
}

setup_repository() {
    log_step "Setting up application repository..."
    
    # Check if we're already in the correct directory with a git repository
    if [ -d ".git" ]; then
        log_info "Found existing git repository"
        
        # Verify it's the correct repository
        local current_remote
        current_remote=$(git remote get-url origin 2>/dev/null || echo "")
        
        if [[ "$current_remote" == *"Spotify-echo"* ]] || [[ "$current_remote" == "$REPO_URL" ]]; then
            log_success "Repository verified: $current_remote"
            return 0
        else
            exit_with_help "Directory contains wrong git repository: $current_remote" \
                "The current directory contains a different git repository.
Please either:
1. Run this script from a clean directory, or
2. Run from the correct Spotify-echo repository directory, or  
3. Set REPO_URL environment variable to match your repository"
        fi
    fi
    
    # Check if directory exists but is not a git repository
    if [ -n "$(ls -A . 2>/dev/null)" ]; then
        exit_with_help "Directory $APP_DIR exists but is not a git repository" \
            "The application directory contains files but is not a git repository.
Please either:
1. Remove the directory: sudo rm -rf $APP_DIR
2. Move to a different directory before running deployment
3. Initialize as a git repository manually"
    fi
    
    # Directory is empty or doesn't exist, safe to clone
    log_info "Cloning repository from $REPO_URL..."
    
    if ! git clone "$REPO_URL" .; then
        exit_with_help "Failed to clone repository from $REPO_URL" \
            "Repository cloning failed. This could be due to:
1. Network connectivity issues
2. Invalid repository URL
3. Permission issues (if private repository)
4. Git not installed

Please verify:
- Internet connection is working
- Repository URL is correct: $REPO_URL
- Git is installed: git --version
- Repository is accessible (if private, ensure SSH keys or credentials are set up)"
    fi
    
    log_success "Repository cloned successfully"
}

setup_ssl_certificates() {
    log_info "Checking SSL certificate configuration..."
    
    if [ ! -f "$SSL_DIR/${DOMAIN}.crt" ] || [ ! -f "$SSL_DIR/${DOMAIN}.key" ]; then
        log_warning "SSL certificates not found in $SSL_DIR"
        log_info "Attempting to set up Let's Encrypt certificates..."
        
        # Check if certbot is installed
        if ! command -v certbot &> /dev/null; then
            log_info "Installing certbot..."
            sudo apt update
            sudo apt install -y certbot python3-certbot-nginx
        fi
        
        # Generate certificates
        log_info "Generating SSL certificates for $DOMAIN..."
        if sudo certbot certonly --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN"; then
            # Copy certificates to application directory
            sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/${DOMAIN}.crt"
            sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/${DOMAIN}.key"
            sudo chown $USER:$USER "$SSL_DIR"/*
            
            # Set up auto-renewal
            setup_ssl_renewal
            
            log_success "SSL certificates configured"
        else
            log_warning "SSL certificate generation failed. Continuing without SSL..."
            log_info "You can manually set up SSL later using:"
            log_info "  sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
        fi
    else
        log_success "SSL certificates found"
        
        # Check certificate expiry
        if openssl x509 -checkend 2592000 -noout -in "$SSL_DIR/${DOMAIN}.crt" >/dev/null 2>&1; then
            log_success "SSL certificate is valid for more than 30 days"
        else
            log_warning "SSL certificate expires soon. Consider renewal."
        fi
    fi
}

setup_ssl_renewal() {
    log_info "Setting up SSL certificate auto-renewal..."
    
    # Create renewal script
    sudo tee /etc/cron.monthly/renew-echotune-ssl > /dev/null <<EOF
#!/bin/bash
# Auto-renewal script for EchoTune SSL certificates

certbot renew --quiet || exit 1

# Copy new certificates if renewed
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/${DOMAIN}.crt"
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/${DOMAIN}.key"
    chown $USER:$USER "$SSL_DIR"/*
    
    # Restart nginx to use new certificates
    cd "$APP_DIR" && docker-compose restart nginx
fi
EOF
    
    sudo chmod +x /etc/cron.monthly/renew-echotune-ssl
    log_success "SSL auto-renewal configured"
}

setup_database() {
    log_info "Setting up database connections..."
    
    if [ -n "$MONGODB_URI" ]; then
        log_info "Testing MongoDB connection..."
        if node -e "
            const { MongoClient } = require('mongodb');
            MongoClient.connect('$MONGODB_URI')
                .then(() => { console.log('MongoDB connection successful'); process.exit(0); })
                .catch((err) => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
        " 2>/dev/null; then
            log_success "MongoDB connection verified"
        else
            log_warning "MongoDB connection failed. Please check MONGODB_URI"
        fi
    fi
    
    if [ -n "$REDIS_URL" ]; then
        log_info "Testing Redis connection..."
        if command -v redis-cli &> /dev/null; then
            if redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
                log_success "Redis connection verified"
            else
                log_warning "Redis connection failed. Please check REDIS_URL"
            fi
        else
            log_info "Redis CLI not available, skipping connection test"
        fi
    fi
}

backup_current_deployment() {
    if [ -d "$APP_DIR" ] && docker-compose ps -q > /dev/null 2>&1; then
        log_info "Creating backup of current deployment..."
        
        local backup_name="backup_$(date +%Y%m%d_%H%M%S)"
        local backup_path="$BACKUP_DIR/$backup_name"
        
        mkdir -p "$backup_path"
        
        # Backup configuration files
        cp .env "$backup_path/" 2>/dev/null || true
        cp docker-compose.yml "$backup_path/" 2>/dev/null || true
        cp nginx.conf "$backup_path/" 2>/dev/null || true
        
        # Backup SSL certificates
        if [ -d "$SSL_DIR" ]; then
            cp -r "$SSL_DIR" "$backup_path/" 2>/dev/null || true
        fi
        
        # Create deployment info
        cat > "$backup_path/deployment_info.txt" <<EOF
Backup created: $(date)
Git commit: $(git rev-parse HEAD 2>/dev/null || echo "Unknown")
Docker images:
$(docker-compose images 2>/dev/null || echo "No images found")
EOF
        
        log_success "Backup created at $backup_path"
        
        # Keep only last 5 backups
        ls -dt "$BACKUP_DIR"/backup_* | tail -n +6 | xargs rm -rf 2>/dev/null || true
    fi
}

build_application() {
    log_step "Building application..."
    
    # Pull latest code if in git repository
    if [ -d ".git" ]; then
        log_info "Updating code from repository..."
        if ! git pull origin main 2>/dev/null; then
            log_warning "Could not update from git repository"
            log_info "Continuing with current code version..."
        else
            log_success "Code updated successfully"
        fi
    fi
    
    # Check for required files
    if [ ! -f "docker-compose.yml" ]; then
        exit_with_help "docker-compose.yml file not found" \
            "The deployment requires a docker-compose.yml file.
Please ensure:
1. You're in the correct repository directory
2. The repository contains the necessary Docker configuration
3. The repository clone was successful"
    fi
    
    # Build with Docker Compose
    log_info "Building Docker containers..."
    if ! docker-compose build --no-cache; then
        exit_with_help "Application build failed" \
            "Docker build process failed. This could be due to:
1. Docker not running: sudo systemctl start docker
2. Insufficient disk space: df -h
3. Build dependencies missing
4. Network issues downloading dependencies

Check the build logs above for specific errors.
You can also try:
- Restart Docker: sudo systemctl restart docker
- Clean Docker cache: docker system prune -f
- Check Docker logs: journalctl -u docker"
    fi
    
    log_success "Application built successfully"
}

deploy_application() {
    log_step "Deploying application..."
    
    # Stop existing services gracefully
    log_info "Stopping existing services..."
    if ! docker-compose down --timeout 30; then
        log_warning "Some services may not have stopped cleanly"
    else
        log_success "Existing services stopped"
    fi
    
    # Start services
    log_info "Starting services..."
    if ! docker-compose up -d; then
        exit_with_help "Failed to start services" \
            "Service startup failed. This could be due to:
1. Port conflicts: netstat -tlnp | grep ':80\|:443\|:3000'
2. Resource constraints: free -h && df -h
3. Configuration errors in docker-compose.yml
4. Missing environment variables

Try these troubleshooting steps:
- Check service logs: docker-compose logs
- Verify ports are available: sudo lsof -i :80,443,3000
- Restart Docker: sudo systemctl restart docker
- Check system resources are sufficient"
    fi
    
    log_success "Services started successfully"
}

wait_for_health() {
    log_step "Performing application health check..."
    
    local retries=0
    local health_url="$HEALTH_ENDPOINT"
    
    # Try different health endpoints if main one fails
    local health_endpoints=(
        "http://localhost:3000/health"
        "http://localhost:$PORT/health"
        "http://127.0.0.1:3000/health"
        "http://127.0.0.1:$PORT/"
        "http://localhost:3000/"
    )
    
    while [ $retries -lt $MAX_HEALTH_RETRIES ]; do
        log_info "Health check attempt $((retries + 1))/$MAX_HEALTH_RETRIES..."
        
        # Try each endpoint until one succeeds
        local success=false
        for endpoint in "${health_endpoints[@]}"; do
            log_info "Testing endpoint: $endpoint"
            if curl -f -s --connect-timeout 10 --max-time 30 "$endpoint" > /dev/null 2>&1; then
                log_success "Application is healthy and responding at $endpoint!"
                return 0
            fi
        done
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_HEALTH_RETRIES ]; then
            log_info "Waiting ${HEALTH_RETRY_DELAY}s before next check..."
            sleep $HEALTH_RETRY_DELAY
        fi
    done
    
    log_error "Application health check failed after $MAX_HEALTH_RETRIES attempts"
    echo ""
    log_info "Gathering diagnostic information..."
    echo ""
    echo "🔍 Service Status:"
    if command -v docker-compose &> /dev/null; then
        docker-compose ps || echo "Could not get service status"
    else
        echo "Docker Compose not available"
    fi
    echo ""
    echo "📋 Recent Application Logs:"
    if command -v docker-compose &> /dev/null; then
        docker-compose logs --tail=20 app 2>/dev/null || echo "No app logs available"
    else
        echo "Docker Compose logs not available"
    fi
    echo ""
    echo "🌐 Network Status:"
    netstat -tlnp 2>/dev/null | grep -E ':(80|443|3000)' || echo "No network status available"
    echo ""
    
    exit_with_help "Application failed to become healthy" \
        "The application did not pass health checks. Common issues:
1. Application startup errors - check logs above
2. Port binding issues - verify ports 80,443,3000 are available
3. Database connection problems - check MongoDB/database connectivity
4. Configuration errors - verify .env file settings
5. Resource constraints - check memory and disk space
6. Docker issues - ensure Docker is running properly

Troubleshooting steps:
- Check detailed logs: docker-compose logs -f
- Verify configuration: cat .env
- Test manually: curl -v http://localhost:3000/
- Check resources: free -h && df -h
- Check Docker: docker ps && docker-compose ps
- Restart services: docker-compose restart"
}

setup_monitoring() {
    log_info "Setting up monitoring and health checks..."
    
    # Ensure monitoring script exists and is executable
    if [ -f "scripts/monitor.sh" ]; then
        sudo cp scripts/monitor.sh /usr/local/bin/echotune-monitor
        sudo chmod +x /usr/local/bin/echotune-monitor
        
        # Create systemd service for monitoring
        sudo tee /etc/systemd/system/echotune-monitor.service > /dev/null <<EOF
[Unit]
Description=EchoTune AI Health Monitor
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/echotune-monitor
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/monitor.log
StandardError=append:$LOG_DIR/monitor-error.log

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable echotune-monitor
        sudo systemctl restart echotune-monitor
        
        log_success "Health monitoring service configured"
    else
        log_warning "Monitor script not found, skipping monitoring setup"
    fi
}

configure_firewall() {
    log_info "Configuring firewall..."
    
    if command -v ufw &> /dev/null; then
        # Configure UFW if it exists
        sudo ufw --force enable
        sudo ufw allow ssh
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
        
        log_success "Firewall configured"
    else
        log_warning "UFW not found, skipping firewall configuration"
        log_info "Please ensure ports 80 and 443 are open"
    fi
}

generate_deployment_report() {
    log_info "Generating deployment report..."
    
    local report_file="$LOG_DIR/deployment_$(date +%Y%m%d_%H%M%S).log"
    
    cat > "$report_file" <<EOF
EchoTune AI Deployment Report
=============================
Date: $(date)
User: $USER
Domain: $DOMAIN
App Directory: $APP_DIR

Environment:
- NODE_ENV: $NODE_ENV
- PORT: $PORT
- Frontend URL: $FRONTEND_URL

Services Status:
$(docker-compose ps)

System Resources:
$(df -h / | tail -1)
$(free -h | head -2)

Network Ports:
$(sudo netstat -tlnp | grep -E ':(80|443|3000) ')

Recent Logs:
$(docker-compose logs --tail=10 app 2>/dev/null || echo "No logs available")
EOF
    
    log_success "Deployment report saved to $report_file"
}

main() {
    echo "🚀 EchoTune AI - Enhanced Production Deployment"
    echo "=============================================="
    echo ""
    
    log_step "🏁 Starting deployment process..."
    echo ""
    
    # Enhanced cleanup function
    cleanup_on_error() {
        log_error "Production deployment failed or was interrupted"
        log_info "Cleaning up partial installation..."
        
        # Stop any running Docker containers
        if command_exists docker-compose && [ -f "docker-compose.yml" ]; then
            docker-compose down --timeout 10 2>/dev/null || true
        fi
        
        echo ""
        log_error "Production deployment was interrupted or failed"
        echo ""
        echo -e "${YELLOW}🔍 Troubleshooting Steps:${NC}"
        echo "   1. Check system requirements and environment configuration"
        echo "   2. Verify all prerequisites are installed"
        echo "   3. Check available disk space: df -h"
        echo "   4. Review logs for specific errors"
        echo ""
        echo -e "${YELLOW}💡 Common Solutions:${NC}"
        echo "   - Restart Docker: sudo systemctl restart docker"
        echo "   - Update environment: cp .env.example .env && nano .env"
        echo "   - Check permissions: sudo chown -R \$USER:\$USER /opt/echotune"
        echo "   - Free disk space: docker system prune -f"
        echo ""
    }
    
    # Set error handler
    trap cleanup_on_error ERR INT TERM
    
    # Ensure we're in the app directory, create if needed
    if [ ! -d "$APP_DIR" ]; then
        log_info "Creating application directory: $APP_DIR"
        sudo mkdir -p "$APP_DIR"
        sudo chown "$USER:$USER" "$APP_DIR"
    fi
    
    # Change to app directory
    if ! cd "$APP_DIR"; then
        exit_with_help "Cannot access application directory: $APP_DIR" \
            "Failed to change to application directory.
Please ensure:
1. Directory exists and is accessible
2. Current user has appropriate permissions
3. Disk space is available

You may need to run: sudo mkdir -p $APP_DIR && sudo chown \$USER:\$USER $APP_DIR"
    fi
    
    log_success "Working in directory: $(pwd)"
    echo ""
    
    # Step 1: Environment Detection
    log_step "🔧 Step 1: Detecting and loading environment configuration..."
    if ! detect_and_source_env; then
        exit_with_help "Environment configuration not found or invalid" \
            "No valid .env file found or environment loading failed.
Please ensure:
1. Create .env file: cp .env.example .env
2. Configure required variables (see DIGITALOCEAN_DEPLOYMENT.md)
3. Verify file permissions allow reading"
    fi
    echo ""
    
    # Step 2: Prerequisites Check
    log_step "✅ Step 2: Checking deployment prerequisites..."
    check_root
    validate_environment
    echo ""
    
    # Step 3: Repository Setup
    log_step "📁 Step 3: Setting up repository and directories..."
    setup_directories
    setup_repository
    echo ""
    
    # Step 4: Infrastructure Setup
    log_step "🔒 Step 4: Setting up infrastructure (SSL, database, etc.)..."
    setup_ssl_certificates
    setup_database
    echo ""
    
    # Step 5: Backup Current Deployment
    log_step "💾 Step 5: Creating backup of current deployment..."
    backup_current_deployment
    echo ""
    
    # Step 6: Build Application
    log_step "🔨 Step 6: Building application..."
    build_application
    echo ""
    
    # Step 7: Deploy Application
    log_step "🚀 Step 7: Deploying application..."
    deploy_application
    echo ""
    
    # Step 8: Health Check
    log_step "🏥 Step 8: Verifying application health..."
    if wait_for_health; then
        echo ""
        
        # Step 9: Final Setup
        log_step "⚙️  Step 9: Finalizing deployment (monitoring, firewall, etc.)..."
        setup_monitoring
        configure_firewall
        generate_deployment_report
        echo ""
        
        # Clear error trap on success
        trap - ERR INT TERM
        
        # Success summary
        echo "════════════════════════════════════════"
        log_success "🎉 Deployment completed successfully!"
        echo "════════════════════════════════════════"
        echo ""
        echo "📊 Service Status:"
        docker-compose ps
        echo ""
        echo "🌐 Application URLs:"
        echo "   - https://$DOMAIN (production)"
        echo "   - https://www.$DOMAIN (www redirect)"
        echo "   - http://localhost:3000 (direct, local only)"
        echo ""
        echo "📋 Management Commands:"
        echo "   - View logs: docker-compose logs -f"
        echo "   - Restart: docker-compose restart"
        echo "   - Stop: docker-compose down"
        echo "   - Monitor: systemctl status echotune-monitor"
        echo ""
        echo "📁 Important Paths:"
        echo "   - Logs: $LOG_DIR"
        echo "   - Backups: $BACKUP_DIR"
        echo "   - SSL Certificates: $SSL_DIR"
        echo ""
        echo "✨ Your EchoTune AI deployment is ready!"
    else
        echo ""
        exit_with_help "Application health check failed - deployment incomplete" \
            "The deployment process completed but the application is not responding.
This means the services started but something is preventing proper operation.
Check the diagnostic information above and troubleshoot accordingly."
    fi
}

# Run main function
main "$@"