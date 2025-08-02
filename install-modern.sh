#!/bin/bash
set -e

# ============================================================================
# EchoTune AI - Modern One-Click Installation Script
# ============================================================================
# Automatically detects environment and installs dependencies optimally
# Supports: Local development, Docker, DigitalOcean, Ubuntu/Debian, macOS
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
APP_NAME="EchoTune AI"
REQUIRED_NODE_VERSION="20"
REQUIRED_PYTHON_VERSION="3.8"
INSTALL_DIR="${PWD}"
PORT="${PORT:-3000}"

# Installation flags
SKIP_DEPENDENCIES=false
PRODUCTION_MODE=false
DOCKER_MODE=false
QUICK_MODE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-deps)
            SKIP_DEPENDENCIES=true
            shift
            ;;
        --production)
            PRODUCTION_MODE=true
            shift
            ;;
        --docker)
            DOCKER_MODE=true
            shift
            ;;
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --help)
            echo "EchoTune AI Installation Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-deps      Skip system dependency installation"
            echo "  --production     Install for production deployment"
            echo "  --docker         Use Docker installation mode"
            echo "  --quick          Quick setup (skip optional features)"
            echo "  --port PORT      Set application port (default: 3000)"
            echo "  --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Standard development installation"
            echo "  $0 --production       # Production deployment"
            echo "  $0 --docker           # Docker-based setup"
            echo "  $0 --quick            # Fast minimal setup"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Environment detection
detect_environment() {
    log_info "Detecting environment..."
    
    # Check if running in Docker
    if [ -f /.dockerenv ] || grep -q 'docker\|lxc' /proc/1/cgroup 2>/dev/null; then
        ENVIRONMENT="docker"
    # Check if running on DigitalOcean
    elif curl -s --max-time 2 http://169.254.169.254/metadata/v1/vendor 2>/dev/null | grep -q "DigitalOcean"; then
        ENVIRONMENT="digitalocean"
    # Check OS
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        ENVIRONMENT="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            ENVIRONMENT="ubuntu"
        elif command -v yum &> /dev/null; then
            ENVIRONMENT="centos"
        else
            ENVIRONMENT="linux"
        fi
    else
        ENVIRONMENT="unknown"
    fi
    
    log_success "Environment detected: $ENVIRONMENT"
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    local missing_deps=()
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing_deps+=("node")
    else
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -lt "$REQUIRED_NODE_VERSION" ]; then
            log_warning "Node.js version $node_version is below required version $REQUIRED_NODE_VERSION"
            missing_deps+=("node")
        fi
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        missing_deps+=("python3")
    else
        local python_version=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        local python_major=$(echo "$python_version" | cut -d'.' -f1)
        local python_minor=$(echo "$python_version" | cut -d'.' -f2)
        if [ "$python_major" -lt 3 ] || ([ "$python_major" -eq 3 ] && [ "$python_minor" -lt 8 ]); then
            log_warning "Python version $python_version is below required version $REQUIRED_PYTHON_VERSION"
            missing_deps+=("python3")
        fi
    fi
    
    # Check pip
    if ! command -v pip3 &> /dev/null && ! command -v pip &> /dev/null; then
        missing_deps+=("pip")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_warning "Missing dependencies: ${missing_deps[*]}"
        return 1
    else
        log_success "All requirements satisfied"
        return 0
    fi
}

# Install system dependencies
install_system_dependencies() {
    if [ "$SKIP_DEPENDENCIES" = true ]; then
        log_info "Skipping system dependency installation"
        return 0
    fi
    
    log_info "Installing system dependencies for $ENVIRONMENT..."
    
    case $ENVIRONMENT in
        "ubuntu"|"digitalocean")
            sudo apt-get update
            sudo apt-get install -y curl wget git build-essential
            
            # Install Node.js
            if ! check_requirements; then
                curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_VERSION}.x | sudo -E bash -
                sudo apt-get install -y nodejs
            fi
            
            # Install Python
            sudo apt-get install -y python3 python3-pip python3-venv
            ;;
            
        "macos")
            # Check if Homebrew is installed
            if ! command -v brew &> /dev/null; then
                log_info "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            
            # Install dependencies via Homebrew
            if ! check_requirements; then
                brew install node python@3.11
            fi
            ;;
            
        "docker")
            log_info "Running in Docker container - dependencies should be pre-installed"
            ;;
            
        *)
            log_warning "Unsupported environment: $ENVIRONMENT"
            log_info "Please install Node.js $REQUIRED_NODE_VERSION+ and Python $REQUIRED_PYTHON_VERSION+ manually"
            ;;
    esac
}

# Install application dependencies
install_app_dependencies() {
    log_info "Installing application dependencies..."
    
    # Install Node.js dependencies
    log_info "Installing Node.js packages..."
    if [ "$PRODUCTION_MODE" = true ]; then
        npm ci --only=production
    else
        npm install
    fi
    
    # Install Python dependencies
    log_info "Installing Python packages..."
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    
    # Activate virtual environment
    source venv/bin/activate
    
    # Upgrade pip
    pip install --upgrade pip
    
    # Install Python dependencies
    if [ "$PRODUCTION_MODE" = true ] && [ -f "requirements-production.txt" ]; then
        pip install -r requirements-production.txt
    elif [ -f "requirements.txt" ]; then
        pip install -r requirements.txt
    fi
    
    # Install core requirements if available
    if [ -f "requirements-core.txt" ]; then
        pip install -r requirements-core.txt
    fi
}

# Setup environment configuration
setup_environment() {
    log_info "Setting up environment configuration..."
    
    # Copy environment file
    if [ ! -f ".env" ]; then
        if [ "$PRODUCTION_MODE" = true ] && [ -f ".env.production.example" ]; then
            cp .env.production.example .env
            log_success "Created .env from production example"
        elif [ -f ".env.example" ]; then
            cp .env.example .env
            log_success "Created .env from example"
        else
            log_warning "No .env.example file found"
        fi
    else
        log_info ".env file already exists"
    fi
    
    # Set default environment variables
    if [ -f ".env" ]; then
        # Update port if specified
        if grep -q "PORT=" .env; then
            sed -i.bak "s/PORT=.*/PORT=$PORT/" .env
        else
            echo "PORT=$PORT" >> .env
        fi
        
        # Set environment mode
        if [ "$PRODUCTION_MODE" = true ]; then
            sed -i.bak "s/NODE_ENV=.*/NODE_ENV=production/" .env
        else
            sed -i.bak "s/NODE_ENV=.*/NODE_ENV=development/" .env
        fi
        
        # Clean up backup files
        rm -f .env.bak
        
        log_success "Environment configuration updated"
    fi
}

# Setup MCP servers (if not in quick mode)
setup_mcp_servers() {
    if [ "$QUICK_MODE" = true ]; then
        log_info "Skipping MCP server setup (quick mode)"
        return 0
    fi
    
    log_info "Setting up MCP servers..."
    
    # Install MCP servers
    if npm run mcp-install 2>/dev/null; then
        log_success "MCP servers installed successfully"
        
        # Test MCP health
        if npm run mcp-health 2>/dev/null; then
            log_success "MCP servers are healthy"
        else
            log_warning "MCP server health check failed (non-critical)"
        fi
    else
        log_warning "MCP server installation failed (non-critical)"
    fi
}

# Initialize database (if needed)
initialize_database() {
    log_info "Initializing database..."
    
    # Run database setup if script exists
    if [ -f "scripts/database_setup.py" ]; then
        if source venv/bin/activate && python scripts/database_setup.py; then
            log_success "Database initialized successfully"
        else
            log_warning "Database initialization failed (non-critical)"
        fi
    else
        log_info "No database setup script found"
    fi
}

# Health check
perform_health_check() {
    log_info "Performing health check..."
    
    # Start application in background
    log_info "Starting application..."
    
    if [ "$PRODUCTION_MODE" = true ]; then
        npm start &
    else
        npm run dev &
    fi
    
    local app_pid=$!
    
    # Wait for application to start
    sleep 10
    
    # Check if process is still running
    if kill -0 "$app_pid" 2>/dev/null; then
        # Test health endpoint
        if curl -f http://localhost:$PORT/health 2>/dev/null; then
            log_success "Application is running and healthy!"
            kill $app_pid 2>/dev/null || true
            return 0
        else
            log_warning "Application started but health check failed"
            kill $app_pid 2>/dev/null || true
            return 1
        fi
    else
        log_error "Application failed to start"
        return 1
    fi
}

# Docker-specific installation
docker_install() {
    log_info "Setting up Docker installation..."
    
    # Build Docker image
    log_info "Building Docker image..."
    docker build -t echotune-ai:latest .
    
    # Run Docker container
    log_info "Starting Docker container..."
    docker run -d \
        -p $PORT:3000 \
        --name echotune-ai \
        --restart unless-stopped \
        echotune-ai:latest
    
    # Wait for container to start
    sleep 10
    
    # Health check
    if curl -f http://localhost:$PORT/health 2>/dev/null; then
        log_success "Docker container is running and healthy!"
        log_info "Access the application at: http://localhost:$PORT"
        return 0
    else
        log_error "Docker container health check failed"
        return 1
    fi
}

# Main installation flow
main() {
    echo "============================================================================"
    echo "             $APP_NAME - Modern Installation Script"
    echo "============================================================================"
    echo ""
    
    # Detect environment
    detect_environment
    
    # Docker mode
    if [ "$DOCKER_MODE" = true ]; then
        docker_install
        exit $?
    fi
    
    # Change to script directory
    cd "$INSTALL_DIR"
    
    # Install system dependencies
    install_system_dependencies
    
    # Verify requirements
    if ! check_requirements; then
        log_error "System requirements not met after installation attempt"
        log_info "Please install missing dependencies manually and run the script again"
        exit 1
    fi
    
    # Install application dependencies
    install_app_dependencies
    
    # Setup environment
    setup_environment
    
    # Setup MCP servers
    setup_mcp_servers
    
    # Initialize database
    initialize_database
    
    # Perform health check
    if perform_health_check; then
        echo ""
        echo "============================================================================"
        log_success "$APP_NAME installation completed successfully! 🎉"
        echo "============================================================================"
        echo ""
        log_info "📋 Next steps:"
        echo "   1. Configure your .env file with API keys (optional for demo mode)"
        echo "   2. Start the application: npm start"
        echo "   3. Open http://localhost:$PORT in your browser"
        echo ""
        log_info "📚 Documentation:"
        echo "   • README.md - Complete setup guide"
        echo "   • .env.example - Environment configuration examples"
        echo "   • TROUBLESHOOTING.md - Common issues and solutions"
        echo ""
        log_info "🎵 Demo mode is available without API keys!"
        echo ""
        
        # Show quick start commands
        echo "🚀 Quick start commands:"
        echo "   npm start                 # Start the application"
        echo "   npm run dev               # Start with auto-reload"
        echo "   npm run health-check      # Verify application health"
        echo "   npm run mcp-health        # Check MCP servers"
        echo ""
    else
        echo ""
        echo "============================================================================"
        log_warning "$APP_NAME installation completed with warnings"
        echo "============================================================================"
        echo ""
        log_info "The application was installed but may need manual configuration."
        log_info "Check the logs above for specific issues and refer to TROUBLESHOOTING.md"
        echo ""
        log_info "You can still start the application manually:"
        echo "   npm start"
        echo ""
    fi
}

# Run main installation
main "$@"