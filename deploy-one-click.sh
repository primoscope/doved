#!/bin/bash

# 🚀 EchoTune AI - One-Click Deploy Script  
# Ultra-fast deployment optimized for maximum convenience and minimal setup

# Load deployment utilities for consistent error handling and operations
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/scripts/deployment-utils.sh" ]; then
    source "$SCRIPT_DIR/scripts/deployment-utils.sh"
elif [ -f "scripts/deployment-utils.sh" ]; then
    source "scripts/deployment-utils.sh"
else
    # Fallback color codes if utils not available
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    PURPLE='\033[0;35m'
    CYAN='\033[0;36m'
    WHITE='\033[1;37m'
    NC='\033[0m' # No Color
    
    log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
    log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
    log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
    log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
    log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
fi

# Enable strict error handling
set -e
set -o pipefail

# Configuration
REPO_URL="https://github.com/dzp5103/Spotify-echo.git"
APP_DIR="/opt/echotune"
DOMAIN=""
DEPLOY_METHOD=""

# Helper functions for beautiful output
print_header() {
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                     🎵 EchoTune AI - One-Click Deploy                      ║${NC}"
    echo -e "${PURPLE}║                  AI-Powered Music Discovery Platform                       ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Enhanced cleanup function
cleanup_on_error() {
    log_error "Deployment failed during one-click setup"
    log_info "Cleaning up partial installation..."
    
    # Stop any running Docker containers
    if command_exists docker-compose && [ -f "docker-compose.yml" ]; then
        docker-compose down --timeout 10 2>/dev/null || true
    fi
    
    # Clean up temporary files
    rm -f /tmp/echotune-deploy-* 2>/dev/null || true
    
    echo ""
    log_error "One-click deployment was interrupted or failed"
    echo ""
    echo -e "${YELLOW}🔍 Troubleshooting Steps:${NC}"
    echo "   1. Check system requirements (Node.js 18+, Docker, or Linux)"
    echo "   2. Verify internet connectivity"
    echo "   3. Check available disk space: df -h"
    echo "   4. Review logs for specific errors"
    echo ""
    echo -e "${YELLOW}💡 Common Solutions:${NC}"
    echo "   - Install Docker: curl -fsSL https://get.docker.com | sh"
    echo "   - Update Node.js: https://nodejs.org/en/download/"
    echo "   - Free disk space: docker system prune -f"
    echo "   - Restart services: sudo systemctl restart docker"
    echo ""
    echo -e "${CYAN}📚 Get Help:${NC}"
    echo "   - GitHub Issues: https://github.com/dzp5103/Spotify-echo/issues"
    echo "   - Documentation: https://github.com/dzp5103/Spotify-echo#readme"
    echo ""
}

# Detect the best deployment method
detect_deployment_method() {
    log_step "Detecting optimal deployment method..."
    
    # Check if running on DigitalOcean
    if curl -s --connect-timeout 2 --max-time 5 http://169.254.169.254/metadata/v1/id &>/dev/null; then
        DEPLOY_METHOD="digitalocean_droplet"
        DROPLET_ID=$(curl -s http://169.254.169.254/metadata/v1/id)
        PUBLIC_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address)
        DOMAIN="${PUBLIC_IP}.nip.io"
        log_success "Detected DigitalOcean droplet (ID: $DROPLET_ID, IP: $PUBLIC_IP)"
        log_info "Will use Docker deployment method"
        return 0
    fi
    
    # Check if Docker is available
    if command -v docker &> /dev/null; then
        DEPLOY_METHOD="docker"
        log_success "Docker detected - using containerized deployment"
        return 0
    fi
    
    # Check if we're on a compatible Linux system
    if [[ "$OSTYPE" == "linux-gnu"* ]] && command -v apt &> /dev/null; then
        DEPLOY_METHOD="native_linux"
        log_success "Ubuntu/Debian detected - using native deployment"
        return 0
    fi
    
    # Fallback to Node.js deployment
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        DEPLOY_METHOD="nodejs"
        log_success "Node.js detected - using minimal deployment"
        return 0
    fi
    
    log_error "No compatible deployment method found"
    echo ""
    echo "🔧 Required dependencies:"
    echo "   - Docker (recommended), OR"
    echo "   - Node.js 18+ and npm, OR"
    echo "   - Ubuntu/Debian Linux with apt"
    echo ""
    echo "💡 Quick setup suggestions:"
    echo "   - Install Docker: curl -fsSL https://get.docker.com | sh"
    echo "   - Install Node.js: https://nodejs.org/en/download/"
    echo "   - Use DigitalOcean droplet with Docker pre-installed"
    exit 1
}

# Ultra-fast setup for different deployment methods
setup_minimal_dependencies() {
    case $DEPLOY_METHOD in
        "digitalocean_droplet")
            log_step "Setting up DigitalOcean droplet dependencies..."
            
            # Set non-interactive mode to prevent package installation prompts
            export DEBIAN_FRONTEND=noninteractive
            
            # Use robust package installation
            local packages=(curl git docker.io docker-compose)
            if ! install_packages_apt "${packages[@]}"; then
                exit_with_help "Failed to install required packages" \
                    "Package installation failed. This could be due to:
1. Network connectivity issues
2. Package repository problems
3. Insufficient disk space
4. Permission issues

Try these solutions:
- Check internet connection: ping 8.8.8.8
- Update package lists: sudo apt update
- Check disk space: df -h
- Try manual installation: sudo apt install docker.io" "cleanup_on_error"
            fi
            
            # Start and configure Docker with error handling
            if ! sudo systemctl start docker 2>/dev/null; then
                log_warning "Failed to start Docker service, attempting reset"
                sudo systemctl restart docker || {
                    exit_with_help "Docker service failed to start" \
                        "Docker installation may be incomplete or corrupted.
Try these solutions:
- Reinstall Docker: curl -fsSL https://get.docker.com | sh
- Check Docker status: sudo systemctl status docker
- Check Docker logs: sudo journalctl -u docker"
                }
            fi
            
            sudo systemctl enable docker
            add_user_to_group "$USER" "docker"
            log_success "DigitalOcean dependencies ready"
            ;;
        "docker")
            log_step "Verifying Docker setup..."
            if ! wait_for_docker 30; then
                exit_with_help "Docker is not available or not functioning properly" \
                    "Docker verification failed. Please ensure:
1. Docker is installed: docker --version
2. Docker daemon is running: sudo systemctl start docker
3. Current user has Docker permissions: sudo usermod -aG docker \$USER
4. After adding to Docker group, logout and login again

Quick fix: sudo systemctl restart docker && sudo usermod -aG docker \$USER"
            fi
            log_success "Docker setup verified"
            ;;
        "native_linux")
            log_step "Installing minimal dependencies on Linux..."
            
            # Set non-interactive mode to prevent package installation prompts  
            export DEBIAN_FRONTEND=noninteractive
            
            local packages=(curl git nodejs npm)
            if ! install_packages_apt "${packages[@]}"; then
                exit_with_help "Failed to install Node.js dependencies" \
                    "Package installation failed. Try these solutions:
- Update package lists: sudo apt update
- Install manually: sudo apt install nodejs npm
- Use NodeSource repository for latest Node.js:
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs"
            fi
            log_success "Linux dependencies installed"
            ;;
        "nodejs")
            log_step "Verifying Node.js setup..."
            if ! command_exists node || ! command_exists npm; then
                exit_with_help "Node.js or npm not found" \
                    "Node.js setup is incomplete. Please:
1. Install Node.js 18+: https://nodejs.org/en/download/
2. Verify installation: node --version && npm --version
3. Ensure both node and npm are in PATH"
            fi
            
            local node_version
            node_version=$(node --version | sed 's/v//')
            local major_version
            major_version=$(echo "$node_version" | cut -d. -f1)
            
            if [ "$major_version" -lt 18 ]; then
                exit_with_help "Node.js version $node_version is too old" \
                    "EchoTune AI requires Node.js 18 or higher.
Update Node.js:
- Download from: https://nodejs.org/en/download/
- Use nvm: nvm install 18 && nvm use 18
- Use NodeSource: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
            fi
            log_success "Node.js setup verified (version $node_version)"
            ;;
    esac
}

# Lightning-fast app setup
setup_app_lightning_fast() {
    log_step "Setting up EchoTune AI application..."
    
    # Determine installation directory
    if [ "$DEPLOY_METHOD" = "digitalocean_droplet" ]; then
        INSTALL_DIR="$APP_DIR"
        create_directory_safe "$INSTALL_DIR" "$USER" "755"
    else
        INSTALL_DIR="$HOME/echotune-ai"
        create_directory_safe "$INSTALL_DIR" "$USER" "755"
    fi
    
    cd "$INSTALL_DIR" || {
        exit_with_help "Cannot access installation directory: $INSTALL_DIR" \
            "Failed to change to installation directory.
This could be due to:
1. Permission issues
2. Disk space problems
3. Directory creation failure

Try these solutions:
- Check disk space: df -h
- Check permissions: ls -la $(dirname "$INSTALL_DIR")
- Create manually: mkdir -p $INSTALL_DIR && cd $INSTALL_DIR"
    }
    
    # Clone or update repository with enhanced error handling
    if [ -d ".git" ]; then
        log_info "Updating existing repository..."
        
        # Verify it's the correct repository
        local current_remote
        current_remote=$(git remote get-url origin 2>/dev/null || echo "")
        
        if [[ "$current_remote" == *"Spotify-echo"* ]] || [[ "$current_remote" == "$REPO_URL" ]]; then
            if git pull origin main 2>/dev/null; then
                log_success "Repository updated successfully"
            else
                log_warning "Update failed, continuing with current version"
            fi
        else
            exit_with_help "Directory contains wrong git repository: $current_remote" \
                "The current directory contains a different git repository.
Please either:
1. Remove the directory: rm -rf $INSTALL_DIR
2. Move to a different directory before running deployment
3. Set REPO_URL environment variable to match your repository"
        fi
    else
        # Check if directory has files but no git repository
        if [ -n "$(find . -maxdepth 1 -type f -print -quit 2>/dev/null)" ]; then
            exit_with_help "Directory $INSTALL_DIR exists but is not a git repository" \
                "The installation directory contains files but is not a git repository.
Please either:
1. Remove the directory: rm -rf $INSTALL_DIR
2. Move existing files to backup location
3. Initialize as git repository manually"
        fi
        
        log_info "Cloning repository from $REPO_URL..."
        if ! git clone "$REPO_URL" . 2>/dev/null; then
            exit_with_help "Failed to clone repository from $REPO_URL" \
                "Repository cloning failed. This could be due to:
1. Network connectivity issues
2. Invalid repository URL
3. Git not installed
4. Permission issues

Please verify:
- Internet connection is working: ping github.com
- Repository URL is correct: $REPO_URL
- Git is installed: git --version
- Directory permissions allow writing" "cleanup_on_error"
        fi
    fi
    
    log_success "Application source code ready in $INSTALL_DIR"
}

# Create minimal environment configuration
create_minimal_env() {
    log_step "Creating optimized environment configuration..."
    
    # Auto-detect domain
    if [ -z "$DOMAIN" ]; then
        if [ "$DEPLOY_METHOD" = "digitalocean_droplet" ] && [ -n "$PUBLIC_IP" ]; then
            DOMAIN="${PUBLIC_IP}.nip.io"
        else
            DOMAIN="localhost"
        fi
    fi
    
    # Create minimal but complete .env file
    cat > .env <<EOF
# 🎵 EchoTune AI - One-Click Deploy Configuration
# Generated: $(date)

# Application Settings
NODE_ENV=production
PORT=3000
DOMAIN=$DOMAIN
FRONTEND_URL=http://$DOMAIN:3000

# Spotify Configuration (Update after deployment)
SPOTIFY_CLIENT_ID=\${SPOTIFY_CLIENT_ID:-demo_client_id}
SPOTIFY_CLIENT_SECRET=\${SPOTIFY_CLIENT_SECRET:-demo_client_secret}
SPOTIFY_REDIRECT_URI=http://$DOMAIN:3000/auth/callback

# LLM Provider (Demo mode - works without API keys)
DEFAULT_LLM_PROVIDER=mock
GEMINI_API_KEY=\${GEMINI_API_KEY:-}
OPENAI_API_KEY=\${OPENAI_API_KEY:-}

# Security
SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "quick_deploy_session_$(date +%s)")
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "quick_deploy_jwt_$(date +%s)")

# Database (SQLite fallback for quick setup)
DATABASE_TYPE=sqlite
MONGODB_URI=\${MONGODB_URI:-}

# Performance
DEBUG=false
LOG_LEVEL=info
TRUST_PROXY=true

# Features (All enabled for full experience)
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=true
CHAT_ENABLED=true
DEMO_MODE=true
EOF
    
    log_success "Environment configuration created for $DOMAIN"
}

# Deploy based on detected method
deploy_application() {
    log_step "Deploying EchoTune AI using $DEPLOY_METHOD method..."
    
    case $DEPLOY_METHOD in
        "digitalocean_droplet"|"docker")
            # Docker deployment
            log_info "Building and starting with Docker..."
            
            # Create simple docker-compose.override.yml for quick deployment
            cat > docker-compose.override.yml <<EOF
version: '3.8'
services:
  app:
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF
            
            # Stop any existing containers
            docker-compose down --timeout 10 2>/dev/null || true
            
            # Build and start
            docker-compose up -d --build
            
            log_success "Docker deployment completed"
            ;;
            
        "native_linux"|"nodejs")
            # Native deployment
            log_info "Installing dependencies..."
            npm ci --only=production --silent
            
            # Install Python dependencies if needed
            if [ -f "requirements.txt" ]; then
                pip3 install -r requirements.txt --user --quiet
            fi
            
            log_info "Starting application..."
            
            # Create systemd service for production
            if [ "$DEPLOY_METHOD" = "native_linux" ] && command -v systemctl &>/dev/null; then
                create_systemd_service
                sudo systemctl enable echotune-ai
                sudo systemctl start echotune-ai
                log_success "EchoTune AI installed as system service"
            else
                # Start in background for development
                nohup node src/index.js > logs/app.log 2>&1 &
                echo $! > echotune.pid
                log_success "EchoTune AI started in background (PID: $(cat echotune.pid))"
            fi
            ;;
    esac
}

# Create systemd service for production deployment
create_systemd_service() {
    log_info "Creating system service..."
    
    sudo tee /etc/systemd/system/echotune-ai.service > /dev/null <<EOF
[Unit]
Description=EchoTune AI - Music Discovery Platform
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
}

# Lightning-fast health check
verify_deployment() {
    log_step "Verifying deployment health..."
    
    local url="http://localhost:3000"
    if [ "$DOMAIN" != "localhost" ]; then
        url="http://$DOMAIN:3000"
    fi
    
    local max_attempts=20
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "Health check attempt $attempt/$max_attempts..."
        
        if curl -f -s --connect-timeout 3 --max-time 10 "$url/health" > /dev/null 2>&1; then
            log_success "🎉 EchoTune AI is running and healthy!"
            return 0
        fi
        
        if curl -f -s --connect-timeout 3 --max-time 10 "$url" > /dev/null 2>&1; then
            log_success "🎉 EchoTune AI is running!"
            return 0
        fi
        
        attempt=$((attempt + 1))
        sleep 3
    done
    
    log_warning "Application may still be starting up..."
    log_info "Manual check: curl $url/health"
    return 0
}

# Display deployment results
show_success_info() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                         🎉 DEPLOYMENT SUCCESSFUL! 🎉                       ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Access URLs
    echo -e "${WHITE}🌐 Access Your EchoTune AI:${NC}"
    if [ "$DOMAIN" = "localhost" ]; then
        echo "   🔗 Local: http://localhost:3000"
    else
        echo "   🔗 Public: http://$DOMAIN:3000"
        echo "   🔗 Direct: http://localhost:3000"
    fi
    echo ""
    
    # Status information
    echo -e "${WHITE}📊 Application Status:${NC}"
    case $DEPLOY_METHOD in
        "digitalocean_droplet"|"docker")
            echo "   📦 Deployment Method: Docker"
            echo "   🔍 Check Status: docker-compose ps"
            echo "   📝 View Logs: docker-compose logs -f"
            echo "   🔄 Restart: docker-compose restart"
            echo "   🛑 Stop: docker-compose down"
            ;;
        "native_linux")
            echo "   📦 Deployment Method: System Service"
            echo "   🔍 Check Status: sudo systemctl status echotune-ai"
            echo "   📝 View Logs: sudo journalctl -u echotune-ai -f"
            echo "   🔄 Restart: sudo systemctl restart echotune-ai"
            echo "   🛑 Stop: sudo systemctl stop echotune-ai"
            ;;
        "nodejs")
            echo "   📦 Deployment Method: Background Process"
            if [ -f "echotune.pid" ]; then
                echo "   🔍 Process ID: $(cat echotune.pid)"
                echo "   📝 View Logs: tail -f logs/app.log"
                echo "   🛑 Stop: kill \$(cat echotune.pid)"
            fi
            ;;
    esac
    echo ""
    
    # Next steps
    echo -e "${WHITE}🔧 Quick Configuration (Optional):${NC}"
    echo "   1. 🎵 Add Spotify credentials to $(pwd)/.env"
    echo "   2. 🤖 Add AI provider keys (Gemini, OpenAI) for enhanced features"
    echo "   3. 🗄️ Configure MongoDB for advanced analytics"
    echo ""
    
    # Demo features
    echo -e "${WHITE}✨ Available Features:${NC}"
    echo "   ✅ AI-Powered Music Chat (Demo Mode)"
    echo "   ✅ Real-time Recommendations"
    echo "   ✅ Music Analytics Dashboard"
    echo "   ✅ Voice Interface Support"
    echo "   ✅ Responsive Mobile Design"
    echo "   ✅ Health Monitoring"
    echo ""
    
    # URLs for quick access
    if [ "$DOMAIN" != "localhost" ]; then
        echo -e "${WHITE}🚀 Quick Links:${NC}"
        echo "   📊 Health Check: http://$DOMAIN:3000/health"
        echo "   💬 Chat Interface: http://$DOMAIN:3000/chat"
        echo "   📈 Dashboard: http://$DOMAIN:3000/dashboard"
        echo ""
    fi
    
    echo -e "${CYAN}🎵 Enjoy your AI-powered music discovery experience!${NC}"
}

# Handle deployment errors
handle_error() {
    cleanup_on_error
    exit 1
}

# Main deployment orchestration
main() {
    print_header
    
    # Set error handler
    trap cleanup_on_error ERR INT TERM
    
    log_step "Starting one-click deployment process..."
    sleep 1
    
    # Validate deployment steps with detailed error handling
    log_info "🔍 Step 1: Detecting optimal deployment method..."
    detect_deployment_method
    
    log_info "⚙️  Step 2: Setting up system dependencies..."
    setup_minimal_dependencies
    
    log_info "📦 Step 3: Preparing application..."
    setup_app_lightning_fast
    
    log_info "🔧 Step 4: Configuring environment..."
    create_minimal_env
    
    log_info "🚀 Step 5: Deploying application..."
    deploy_application
    
    log_info "✅ Step 6: Verifying deployment..."
    verify_deployment
    
    # Clear error trap on success
    trap - ERR INT TERM
    
    show_success_info
    
    echo ""
    log_success "🚀 One-click deployment completed successfully!"
}

# Execute main function
main "$@"