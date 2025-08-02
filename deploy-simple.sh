#!/bin/bash

# 🚀 EchoTune AI - Simplified Robust Deployment Script
# Fixes deployment issues with minimal dependencies and better error handling

# Load simplified deployment utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/scripts/deployment-utils-simple.sh" ]]; then
    source "$SCRIPT_DIR/scripts/deployment-utils-simple.sh"
elif [[ -f "scripts/deployment-utils-simple.sh" ]]; then
    source "scripts/deployment-utils-simple.sh"
else
    echo "ERROR: deployment-utils-simple.sh not found in $SCRIPT_DIR or scripts/" >&2
    echo "Please ensure the deployment utilities are present" >&2
    exit 1
fi

# Configuration with environment variable overrides
APP_NAME="doved"
APP_DIR="${APP_DIR:-$(pwd)}"
LOG_DIR="${LOG_DIR:-$APP_DIR/logs}"
DOMAIN="${DOMAIN:-localhost}"
PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-development}"
HEALTH_ENDPOINT="http://localhost:$PORT/health"
MAX_HEALTH_RETRIES=10
HEALTH_RETRY_DELAY=5

# =============================================================================
# MAIN DEPLOYMENT FUNCTIONS
# =============================================================================

# Check prerequisites and system requirements
check_prerequisites() {
    log_step "Checking system prerequisites..."
    
    local required_commands=("node" "npm")
    local optional_commands=("docker" "docker-compose" "git" "curl")
    local missing_required=()
    local missing_optional=()
    
    # Check required commands
    for cmd in "${required_commands[@]}"; do
        if ! command_exists "$cmd"; then
            missing_required+=("$cmd")
        fi
    done
    
    # Check optional commands
    for cmd in "${optional_commands[@]}"; do
        if ! command_exists "$cmd"; then
            missing_optional+=("$cmd")
        fi
    done
    
    # Report missing required commands
    if [[ ${#missing_required[@]} -gt 0 ]]; then
        local missing_list=""
        for cmd in "${missing_required[@]}"; do
            missing_list="$missing_list\n  - $cmd"
        done
        
        exit_with_help "Missing required commands:$missing_list" \
            "Please install the missing requirements:
- Node.js 18+: https://nodejs.org/
- npm: Usually comes with Node.js

Installation examples:
- Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install nodejs
- macOS: brew install node
- Windows: Download from https://nodejs.org/"
    fi
    
    # Report missing optional commands
    if [[ ${#missing_optional[@]} -gt 0 ]]; then
        log_warning "Optional commands not found: ${missing_optional[*]}"
        log_info "These are not required but may limit functionality"
    fi
    
    # Check Node.js version
    local node_version
    node_version=$(node --version 2>/dev/null | sed 's/v//')
    local major_version
    major_version=$(echo "$node_version" | cut -d. -f1)
    
    if [[ $major_version -lt 16 ]]; then
        exit_with_help "Node.js version $node_version is too old" \
            "This application requires Node.js 16 or higher.
Please update Node.js:
- Using node version manager: nvm install 18 && nvm use 18
- Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
- macOS: brew install node
- Windows: Download from https://nodejs.org/"
    fi
    
    log_success "Prerequisites check completed (Node.js $node_version)"
}

# Setup application directories
setup_app_directories() {
    log_step "Setting up application directories..."
    
    # Ensure we're in the application directory
    if ! cd "$APP_DIR" 2>/dev/null; then
        exit_with_help "Cannot access application directory: $APP_DIR" \
            "Please ensure the application directory exists and is accessible:
- Check if directory exists: ls -la $(dirname "$APP_DIR")
- Check permissions: ls -la $APP_DIR
- Create if needed: mkdir -p $APP_DIR"
    fi
    
    # Create necessary subdirectories
    create_directory_safe "$LOG_DIR" "$USER" "755"
    
    # Create a simple .env file if none exists
    if [[ ! -f ".env" ]]; then
        log_info "Creating default .env file..."
        cat > .env <<EOF
# EchoTune AI Configuration
NODE_ENV=$NODE_ENV
PORT=$PORT
DOMAIN=$DOMAIN

# Demo mode settings (works without API keys)
DEFAULT_LLM_PROVIDER=mock
DEMO_MODE=true

# Add your API keys below for full functionality
# SPOTIFY_CLIENT_ID=your_spotify_client_id
# SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
# OPENAI_API_KEY=your_openai_api_key
# GEMINI_API_KEY=your_gemini_api_key
EOF
        log_success "Default .env file created"
    fi
    
    log_success "Application directories ready"
}

# Optimized dependency installation
install_dependencies() {
    log_step "Installing application dependencies..."
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        exit_with_help "package.json not found in current directory" \
            "Please ensure you're in the correct application directory.
Current directory: $(pwd)
Expected files: package.json, src/, README.md"
    fi
    
    # Analyze current dependencies
    analyze_npm_dependencies
    
    # Check if node_modules needs to be rebuilt
    local needs_install=false
    
    if [[ ! -d "node_modules" ]]; then
        log_info "node_modules not found - fresh installation needed"
        needs_install=true
    elif [[ "package.json" -nt "node_modules" ]]; then
        log_info "package.json is newer than node_modules - reinstall needed"
        needs_install=true
    elif [[ "package-lock.json" -nt "node_modules" ]]; then
        log_info "package-lock.json is newer than node_modules - reinstall needed"
        needs_install=true
    fi
    
    if [[ "$needs_install" == "true" ]]; then
        log_info "Installing npm dependencies (this may take a few minutes)..."
        
        # Set npm timeout and registry for better reliability
        export NPM_CONFIG_TIMEOUT=300000
        export NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
        
        # Use npm ci if package-lock.json exists, otherwise npm install
        if [[ -f "package-lock.json" ]]; then
            log_info "Using npm ci for faster, reliable installation..."
            if ! npm ci --only=production --silent --no-audit 2>/dev/null; then
                log_warning "npm ci failed, falling back to npm install"
                if ! npm install --only=production --silent --no-audit; then
                    exit_with_help "Failed to install npm dependencies" \
                        "npm installation failed. This could be due to:
1. Network connectivity issues
2. Permission problems
3. Disk space issues
4. Package conflicts

Try these solutions:
- Clear npm cache: npm cache clean --force
- Remove node_modules: rm -rf node_modules package-lock.json
- Update npm: npm install -g npm@latest
- Check network: curl -I https://registry.npmjs.org/"
                fi
            fi
        else
            log_info "Using npm install..."
            if ! npm install --only=production --silent --no-audit; then
                exit_with_help "Failed to install npm dependencies" \
                    "npm installation failed. Try the troubleshooting steps above."
            fi
        fi
        
        log_success "Dependencies installed successfully"
    else
        log_success "Dependencies are up to date"
    fi
    
    # Install development dependencies if in development mode
    if [[ "$NODE_ENV" == "development" ]]; then
        log_info "Installing development dependencies..."
        npm install --only=dev --silent --no-audit || {
            log_warning "Failed to install development dependencies, continuing..."
        }
    fi
}

# Start the application with proper error handling
start_application() {
    log_step "Starting application..."
    
    # Check if main application file exists
    local main_file="src/index.js"
    if [[ ! -f "$main_file" ]]; then
        main_file="src/server.js"
        if [[ ! -f "$main_file" ]]; then
            exit_with_help "Main application file not found" \
                "Could not find src/index.js or src/server.js
Please ensure the application source code is present."
        fi
    fi
    
    # Check if port is available
    if ! check_port_available "$PORT"; then
        log_warning "Port $PORT appears to be in use"
        if command_exists lsof; then
            log_info "Processes using port $PORT:"
            lsof -ti:"$PORT" | head -5 || true
        fi
        
        # Try to find an alternative port
        local alt_port=$((PORT + 1))
        while [[ $alt_port -lt $((PORT + 10)) ]]; do
            if check_port_available "$alt_port"; then
                log_info "Using alternative port: $alt_port"
                PORT=$alt_port
                export PORT
                break
            fi
            alt_port=$((alt_port + 1))
        done
        
        if ! check_port_available "$PORT"; then
            exit_with_help "No available ports found near $PORT" \
                "Please free up port $PORT or specify a different port:
- Check what's using the port: lsof -i :$PORT
- Kill the process: kill \$(lsof -t -i:$PORT)
- Use different port: PORT=3001 $0"
        fi
    fi
    
    # Create logs directory
    create_directory_safe "$LOG_DIR" "$USER" "755"
    
    # Start application based on available options
    if [[ -f "docker-compose.yml" ]] && command_exists docker-compose; then
        log_info "Starting with Docker Compose..."
        
        # Create override for development
        if [[ "$NODE_ENV" == "development" ]]; then
            cat > docker-compose.override.yml <<EOF
version: '3.8'
services:
  app:
    environment:
      - NODE_ENV=development
      - PORT=$PORT
    ports:
      - "$PORT:$PORT"
    volumes:
      - .:/app
      - /app/node_modules
EOF
        fi
        
        if docker-compose up -d --build; then
            log_success "Application started with Docker Compose"
        else
            log_warning "Docker Compose failed, falling back to direct node execution"
            start_node_directly
        fi
    else
        start_node_directly
    fi
}

# Start Node.js directly
start_node_directly() {
    log_info "Starting Node.js application directly..."
    
    # Set environment variables
    export NODE_ENV="$NODE_ENV"
    export PORT="$PORT"
    
    # Determine how to start the application
    if [[ "$NODE_ENV" == "development" ]] && command_exists npx && npm list nodemon &>/dev/null; then
        log_info "Starting with nodemon for development..."
        nohup npx nodemon "$main_file" > "$LOG_DIR/app.log" 2>&1 &
    else
        log_info "Starting with node..."
        nohup node "$main_file" > "$LOG_DIR/app.log" 2>&1 &
    fi
    
    # Save PID for later management
    echo $! > "$APP_DIR/app.pid"
    log_success "Application started (PID: $(cat "$APP_DIR/app.pid"))"
    log_info "Logs available at: $LOG_DIR/app.log"
}

# Wait for application to become healthy
wait_for_application() {
    log_step "Waiting for application to become ready..."
    
    local retries=0
    local endpoint="$HEALTH_ENDPOINT"
    
    # Try multiple endpoints
    local endpoints=(
        "http://localhost:$PORT/health"
        "http://localhost:$PORT/"
        "http://127.0.0.1:$PORT/health"
        "http://127.0.0.1:$PORT/"
    )
    
    while [[ $retries -lt $MAX_HEALTH_RETRIES ]]; do
        retries=$((retries + 1))
        log_info "Health check attempt $retries/$MAX_HEALTH_RETRIES..."
        
        # Try each endpoint
        for endpoint in "${endpoints[@]}"; do
            if curl -f -s --connect-timeout 3 --max-time 10 "$endpoint" &>/dev/null; then
                log_success "Application is ready and responding at $endpoint!"
                echo ""
                log_info "🌐 Access your application:"
                log_info "   Local: http://localhost:$PORT"
                if [[ "$DOMAIN" != "localhost" ]]; then
                    log_info "   Domain: http://$DOMAIN:$PORT"
                fi
                echo ""
                return 0
            fi
        done
        
        # Show progress and wait
        if [[ $retries -lt $MAX_HEALTH_RETRIES ]]; then
            log_info "Waiting ${HEALTH_RETRY_DELAY}s before next check..."
            sleep $HEALTH_RETRY_DELAY
        fi
    done
    
    # Health check failed
    log_error "Application failed to become ready after $MAX_HEALTH_RETRIES attempts"
    echo ""
    log_info "Diagnostic information:"
    
    # Show recent logs
    if [[ -f "$LOG_DIR/app.log" ]]; then
        echo "Recent application logs:"
        tail -20 "$LOG_DIR/app.log" 2>/dev/null || echo "No logs available"
    fi
    
    # Show process status
    if [[ -f "$APP_DIR/app.pid" ]]; then
        local pid=$(cat "$APP_DIR/app.pid")
        if ps -p "$pid" &>/dev/null; then
            echo "Application process is running (PID: $pid)"
        else
            echo "Application process is not running"
        fi
    fi
    
    # Show port status
    if command_exists netstat; then
        echo "Ports in use:"
        netstat -tlnp 2>/dev/null | grep ":$PORT " || echo "Port $PORT not in use"
    fi
    
    exit_with_help "Application health check failed" \
        "The application started but is not responding to health checks.
Common causes:
1. Application crashed during startup - check logs above
2. Wrong port configuration - verify PORT environment variable
3. Missing dependencies - ensure all npm packages installed
4. Configuration errors - check .env file
5. Database connection issues

Troubleshooting:
- Check logs: tail -f $LOG_DIR/app.log
- Test manually: curl -v http://localhost:$PORT/
- Check process: ps aux | grep node
- Restart: kill \$(cat $APP_DIR/app.pid) && $0"
}

# Folder analysis using MCP tools
analyze_repository() {
    log_step "Analyzing repository structure and dependencies..."
    
    # Basic repository analysis
    echo "=== Repository Analysis ==="
    echo "Location: $(pwd)"
    echo "Size: $(get_directory_size .)"
    echo "Total files: $(count_files . '*')"
    echo ""
    
    # Analyze different types of files
    echo "=== File Type Analysis ==="
    if command_exists find; then
        echo "JavaScript files: $(find . -name "*.js" -type f | wc -l)"
        echo "TypeScript files: $(find . -name "*.ts" -type f | wc -l)"
        echo "JSON files: $(find . -name "*.json" -type f | wc -l)"
        echo "Markdown files: $(find . -name "*.md" -type f | wc -l)"
        echo "Shell scripts: $(find . -name "*.sh" -type f | wc -l)"
        echo ""
    fi
    
    # Analyze package.json if available
    if [[ -f "package.json" ]]; then
        echo "=== NPM Dependencies Analysis ==="
        analyze_npm_dependencies
        echo ""
    fi
    
    # Check for large files that might affect performance
    echo "=== Large Files (>10MB) ==="
    if command_exists find; then
        find . -type f -size +10M -exec ls -lh {} \; 2>/dev/null | head -10 || echo "No large files found"
        echo ""
    fi
    
    # Check for common directories
    echo "=== Directory Structure ==="
    local important_dirs=("src" "scripts" "tests" "docs" "node_modules" ".git")
    for dir in "${important_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            echo "$dir: $(get_directory_size "$dir") ($(count_files "$dir" '*') files)"
        fi
    done
    echo ""
    
    # System resources
    get_system_resources
    
    log_success "Repository analysis completed"
}

# Enhanced cleanup for deployment issues
cleanup_deployment_issues() {
    log_info "Cleaning up deployment issues..."
    
    # Stop any running processes
    if [[ -f "$APP_DIR/app.pid" ]]; then
        local pid=$(cat "$APP_DIR/app.pid")
        if ps -p "$pid" &>/dev/null; then
            log_info "Stopping application process (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            if ps -p "$pid" &>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$APP_DIR/app.pid"
    fi
    
    # Stop Docker containers if running
    if [[ -f "docker-compose.yml" ]] && command_exists docker-compose; then
        log_info "Stopping Docker containers..."
        docker-compose down --timeout 10 &>/dev/null || true
    fi
    
    # Clean up temporary files
    rm -f docker-compose.override.yml 2>/dev/null || true
    
    log_info "Deployment cleanup completed"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo "🚀 EchoTune AI - Simplified Deployment"
    echo "====================================="
    echo ""
    
    # Set up error handling
    trap cleanup_deployment_issues ERR INT TERM
    
    log_step "Starting deployment process..."
    echo ""
    
    # Step 1: Prerequisites
    check_prerequisites
    echo ""
    
    # Step 2: Repository Analysis
    if [[ "${ANALYZE_REPO:-true}" == "true" ]]; then
        analyze_repository
        echo ""
    fi
    
    # Step 3: Setup Directories
    setup_app_directories
    echo ""
    
    # Step 4: Install Dependencies
    install_dependencies
    echo ""
    
    # Step 5: Start Application
    start_application
    echo ""
    
    # Step 6: Health Check
    wait_for_application
    
    # Clear error trap on success
    trap - ERR INT TERM
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Visit http://localhost:$PORT to access the application"
    echo "2. Configure API keys in .env for full functionality"
    echo "3. Check logs: tail -f $LOG_DIR/app.log"
    echo ""
}

# Handle command line arguments
case "${1:-}" in
    "--help"|"-h")
        echo "EchoTune AI - Simplified Deployment Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h          Show this help message"
        echo "  --no-analysis       Skip repository analysis"
        echo "  --port PORT         Use specific port (default: 3000)"
        echo "  --dev               Development mode"
        echo "  --prod              Production mode"
        echo ""
        echo "Environment Variables:"
        echo "  APP_DIR             Application directory (default: current directory)"
        echo "  PORT                Port to use (default: 3000)"
        echo "  NODE_ENV            Environment mode (default: development)"
        echo "  DOMAIN              Domain name (default: localhost)"
        echo ""
        exit 0
        ;;
    "--no-analysis")
        export ANALYZE_REPO=false
        shift
        ;;
    "--port")
        if [[ -n "${2:-}" ]]; then
            export PORT="$2"
            shift 2
        else
            echo "Error: --port requires a port number" >&2
            exit 1
        fi
        ;;
    "--dev")
        export NODE_ENV=development
        shift
        ;;
    "--prod")
        export NODE_ENV=production
        shift
        ;;
esac

# Run main function
main "$@"