#!/bin/bash

# 🔍 EchoTune AI - Comprehensive Deployment Validator
# Complete validation system for all deployment methods and configurations
# Validates Ubuntu production deployments, DigitalOcean, environment setup, and all integrations

set -e
set -o pipefail

# Enhanced error handling
trap 'handle_error $? $LINENO $BASH_COMMAND' ERR

# Colors and formatting
declare -A COLORS=(
    [RED]='\033[0;31m'
    [GREEN]='\033[0;32m'
    [YELLOW]='\033[1;33m'
    [BLUE]='\033[0;34m'
    [PURPLE]='\033[0;35m'
    [CYAN]='\033[0;36m'
    [WHITE]='\033[1;37m'
    [BOLD]='\033[1m'
    [NC]='\033[0m'
)

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VALIDATION_LOG="$PROJECT_ROOT/validation-results.log"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
TEMP_DIR="/tmp/echotune_validation_$TIMESTAMP"

# Validation flags
VALIDATE_ALL=false
VALIDATE_DEPLOYMENT=true
VALIDATE_ENV=true
VALIDATE_SERVICES=true
VALIDATE_NGINX=true
VALIDATE_SSL=false
VALIDATE_DOCKER=true
VALIDATE_DOCS=false
INTERACTIVE_MODE=false
FIX_ISSUES=false
DOMAIN=""
TARGET_ENVIRONMENT="development"

# Results tracking
declare -A VALIDATION_RESULTS
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Logging functions
log() {
    local level="$1"
    local message="$2"
    local color="${COLORS[${level}]:-${COLORS[NC]}}"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${color}[${level}] ${message}${COLORS[NC]}"
    echo "[$timestamp] [$level] $message" >> "$VALIDATION_LOG"
}

log_info() { log "INFO" "$1"; }
log_success() { log "SUCCESS" "$1"; }
log_warning() { log "WARNING" "$1"; }
log_error() { log "ERROR" "$1"; }
log_step() { log "STEP" "$1"; }

# Error handling
handle_error() {
    local exit_code=$1
    local line_number=$2
    local command="$3"
    
    log_error "Validation failed at line $line_number: $command (exit code: $exit_code)"
    cleanup_temp_files
    exit $exit_code
}

# Cleanup function
cleanup_temp_files() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR" 2>/dev/null || true
    fi
}

# Helper functions
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

service_running() {
    systemctl is-active --quiet "$1" 2>/dev/null
}

port_in_use() {
    local port="$1"
    netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "
}

file_has_content() {
    [ -f "$1" ] && [ -s "$1" ]
}

validate_url() {
    local url="$1"
    curl -f -s --connect-timeout 5 --max-time 10 "$url" >/dev/null 2>&1
}

# Header display
print_header() {
    clear
    echo -e "${COLORS[PURPLE]}╔══════════════════════════════════════════════════════════════════════════════╗${COLORS[NC]}"
    echo -e "${COLORS[PURPLE]}║               🔍 EchoTune AI - Comprehensive Validator                    ║${COLORS[NC]}"
    echo -e "${COLORS[PURPLE]}║                    Production Deployment Validation                       ║${COLORS[NC]}"
    echo -e "${COLORS[PURPLE]}╚══════════════════════════════════════════════════════════════════════════════╝${COLORS[NC]}"
    echo ""
    echo -e "${COLORS[CYAN]}🎯 Target Environment: ${COLORS[WHITE]}$TARGET_ENVIRONMENT${COLORS[NC]}"
    echo -e "${COLORS[CYAN]}📁 Project Root: ${COLORS[WHITE]}$PROJECT_ROOT${COLORS[NC]}"
    echo -e "${COLORS[CYAN]}📝 Validation Log: ${COLORS[WHITE]}$VALIDATION_LOG${COLORS[NC]}"
    echo ""
}

# Record validation result
record_result() {
    local check_name="$1"
    local result="$2"  # PASS, FAIL, WARNING
    local message="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    VALIDATION_RESULTS["$check_name"]="$result:$message"
    
    case "$result" in
        "PASS")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            log_success "$check_name: $message"
            ;;
        "FAIL")
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            log_error "$check_name: $message"
            ;;
        "WARNING")
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
            log_warning "$check_name: $message"
            ;;
    esac
}

# System Requirements Validation
validate_system_requirements() {
    log_step "Validating system requirements..."
    
    # Operating System
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            record_result "OS_VERSION" "PASS" "Running $NAME $VERSION_ID"
            
            if [[ "$ID" == "ubuntu" ]] || [[ "$ID" == "debian" ]]; then
                record_result "OS_COMPATIBILITY" "PASS" "Ubuntu/Debian detected - fully supported"
            else
                record_result "OS_COMPATIBILITY" "WARNING" "Non-Ubuntu/Debian Linux detected - may work but not fully tested"
            fi
        else
            record_result "OS_VERSION" "WARNING" "Cannot detect Linux distribution"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        record_result "OS_VERSION" "PASS" "Running macOS"
        record_result "OS_COMPATIBILITY" "WARNING" "macOS detected - development only, not for production"
    else
        record_result "OS_VERSION" "FAIL" "Unsupported operating system: $OSTYPE"
    fi
    
    # Node.js
    if command_exists node; then
        local node_version=$(node --version | sed 's/v//')
        local major_version=$(echo "$node_version" | cut -d. -f1)
        
        if [ "$major_version" -ge 18 ]; then
            record_result "NODEJS_VERSION" "PASS" "Node.js $node_version (>= 18 required)"
        else
            record_result "NODEJS_VERSION" "FAIL" "Node.js $node_version is too old (>= 18 required)"
        fi
    else
        record_result "NODEJS_VERSION" "FAIL" "Node.js not found"
    fi
    
    # npm
    if command_exists npm; then
        local npm_version=$(npm --version)
        record_result "NPM_VERSION" "PASS" "npm $npm_version"
    else
        record_result "NPM_VERSION" "FAIL" "npm not found"
    fi
    
    # Python
    if command_exists python3; then
        local python_version=$(python3 --version | cut -d' ' -f2)
        local major_version=$(echo "$python_version" | cut -d. -f1)
        local minor_version=$(echo "$python_version" | cut -d. -f2)
        
        if [ "$major_version" -eq 3 ] && [ "$minor_version" -ge 8 ]; then
            record_result "PYTHON_VERSION" "PASS" "Python $python_version (>= 3.8 required)"
        else
            record_result "PYTHON_VERSION" "FAIL" "Python $python_version is too old (>= 3.8 required)"
        fi
    else
        record_result "PYTHON_VERSION" "FAIL" "Python3 not found"
    fi
    
    # pip
    if command_exists pip3 || command_exists pip; then
        record_result "PIP_AVAILABLE" "PASS" "pip is available"
    else
        record_result "PIP_AVAILABLE" "FAIL" "pip not found"
    fi
    
    # Docker (optional but recommended for production)
    if command_exists docker; then
        if docker --version >/dev/null 2>&1; then
            local docker_version=$(docker --version | cut -d' ' -f3 | sed 's/,//')
            record_result "DOCKER_VERSION" "PASS" "Docker $docker_version"
            
            # Check if Docker daemon is running
            if docker ps >/dev/null 2>&1; then
                record_result "DOCKER_DAEMON" "PASS" "Docker daemon is running"
            else
                record_result "DOCKER_DAEMON" "FAIL" "Docker daemon not running or not accessible"
            fi
        else
            record_result "DOCKER_VERSION" "FAIL" "Docker installed but not working"
        fi
    else
        record_result "DOCKER_VERSION" "WARNING" "Docker not found (optional but recommended for production)"
    fi
    
    # Docker Compose (if Docker is available)
    if command_exists docker-compose || command_exists docker compose; then
        record_result "DOCKER_COMPOSE" "PASS" "Docker Compose is available"
    else
        if command_exists docker; then
            record_result "DOCKER_COMPOSE" "WARNING" "Docker Compose not found (recommended with Docker)"
        fi
    fi
}

# Environment Configuration Validation
validate_environment_config() {
    log_step "Validating environment configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Check for environment files
    if [ -f ".env" ]; then
        record_result "ENV_FILE_EXISTS" "PASS" ".env file exists"
        
        # Validate .env syntax
        if env -i bash -c 'set -a && source .env && env' >/dev/null 2>&1; then
            record_result "ENV_FILE_SYNTAX" "PASS" ".env file has valid syntax"
        else
            record_result "ENV_FILE_SYNTAX" "FAIL" ".env file has syntax errors"
        fi
        
        # Load environment variables
        set -a
        source .env 2>/dev/null || true
        set +a
        
        # Validate critical environment variables
        local required_vars=(
            "NODE_ENV"
            "PORT"
            "DOMAIN"
        )
        
        for var in "${required_vars[@]}"; do
            if [ -n "${!var:-}" ]; then
                record_result "ENV_VAR_$var" "PASS" "$var is set to '${!var}'"
            else
                record_result "ENV_VAR_$var" "WARNING" "$var is not set"
            fi
        done
        
        # Validate optional but important variables
        local optional_vars=(
            "SPOTIFY_CLIENT_ID"
            "SPOTIFY_CLIENT_SECRET"
            "MONGODB_URI"
            "GEMINI_API_KEY"
            "OPENAI_API_KEY"
        )
        
        local api_keys_count=0
        for var in "${optional_vars[@]}"; do
            if [ -n "${!var:-}" ] && [ "${!var}" != "your_${var,,}_here" ] && [ "${!var}" != "demo_${var,,}" ]; then
                record_result "ENV_OPTIONAL_$var" "PASS" "$var is configured"
                if [[ "$var" == *"API_KEY"* ]] || [[ "$var" == *"CLIENT"* ]]; then
                    api_keys_count=$((api_keys_count + 1))
                fi
            else
                record_result "ENV_OPTIONAL_$var" "WARNING" "$var not configured (demo mode will be used)"
            fi
        done
        
        if [ $api_keys_count -gt 0 ]; then
            record_result "API_KEYS_CONFIGURED" "PASS" "$api_keys_count API key(s) configured"
        else
            record_result "API_KEYS_CONFIGURED" "WARNING" "No API keys configured - running in demo mode"
        fi
        
    else
        record_result "ENV_FILE_EXISTS" "FAIL" ".env file not found"
        
        # Check for example files
        if [ -f ".env.example" ]; then
            record_result "ENV_EXAMPLE_EXISTS" "PASS" ".env.example found"
        fi
        
        if [ -f ".env.production.example" ]; then
            record_result "ENV_PRODUCTION_EXAMPLE" "PASS" ".env.production.example found"
        fi
    fi
}

# Dependencies Validation
validate_dependencies() {
    log_step "Validating project dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Check package.json
    if [ -f "package.json" ]; then
        record_result "PACKAGE_JSON_EXISTS" "PASS" "package.json exists"
        
        # Check if node_modules exists
        if [ -d "node_modules" ]; then
            record_result "NODE_MODULES_EXISTS" "PASS" "node_modules directory exists"
            
            # Validate package-lock.json
            if [ -f "package-lock.json" ]; then
                record_result "PACKAGE_LOCK_EXISTS" "PASS" "package-lock.json exists"
            else
                record_result "PACKAGE_LOCK_EXISTS" "WARNING" "package-lock.json missing (will be created on npm install)"
            fi
        else
            record_result "NODE_MODULES_EXISTS" "FAIL" "node_modules directory missing - run npm install"
        fi
    else
        record_result "PACKAGE_JSON_EXISTS" "FAIL" "package.json not found"
    fi
    
    # Check Python requirements
    local python_req_files=("requirements.txt" "requirements-core.txt" "requirements-production.txt")
    local found_python_requirements=false
    
    for req_file in "${python_req_files[@]}"; do
        if [ -f "$req_file" ]; then
            record_result "PYTHON_REQUIREMENTS_$req_file" "PASS" "$req_file exists"
            found_python_requirements=true
        fi
    done
    
    if [ "$found_python_requirements" = false ]; then
        record_result "PYTHON_REQUIREMENTS" "WARNING" "No Python requirements files found"
    fi
    
    # Check virtual environment
    if [ -d "venv" ]; then
        record_result "PYTHON_VENV" "PASS" "Python virtual environment exists"
        
        # Check if it's activated or can be activated
        if [ -f "venv/bin/activate" ]; then
            record_result "PYTHON_VENV_ACTIVATABLE" "PASS" "Virtual environment can be activated"
        else
            record_result "PYTHON_VENV_ACTIVATABLE" "FAIL" "Virtual environment appears corrupted"
        fi
    else
        record_result "PYTHON_VENV" "WARNING" "Python virtual environment not found (recommended for Python packages)"
    fi
}

# Service Integration Validation
validate_service_integrations() {
    log_step "Validating service integrations..."
    
    cd "$PROJECT_ROOT"
    
    # Load environment if available
    if [ -f ".env" ]; then
        set -a
        source .env 2>/dev/null || true
        set +a
    fi
    
    # Test MongoDB connection
    if [ -n "${MONGODB_URI:-}" ]; then
        log_info "Testing MongoDB connection..."
        if command_exists python3; then
            cat > "$TEMP_DIR/test_mongodb.py" << 'EOF'
import sys
import os
from pymongo import MongoClient
from urllib.parse import urlparse

mongodb_uri = os.getenv('MONGODB_URI')
if not mongodb_uri:
    print("MONGODB_URI not set")
    sys.exit(1)

try:
    client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
    # Test connection
    client.admin.command('ping')
    print("MongoDB connection successful")
    sys.exit(0)
except Exception as e:
    print(f"MongoDB connection failed: {e}")
    sys.exit(1)
EOF
            
            if MONGODB_URI="$MONGODB_URI" python3 "$TEMP_DIR/test_mongodb.py" 2>/dev/null; then
                record_result "MONGODB_CONNECTION" "PASS" "MongoDB connection successful"
            else
                record_result "MONGODB_CONNECTION" "FAIL" "MongoDB connection failed"
            fi
        else
            record_result "MONGODB_CONNECTION" "WARNING" "Cannot test MongoDB (Python3 not available)"
        fi
    else
        record_result "MONGODB_CONNECTION" "WARNING" "MongoDB not configured (will use SQLite fallback)"
    fi
    
    # Test Redis connection
    if [ -n "${REDIS_URL:-}" ]; then
        log_info "Testing Redis connection..."
        if command_exists redis-cli; then
            local redis_host=$(echo "$REDIS_URL" | sed -n 's|redis://\([^:]*\).*|\1|p')
            local redis_port=$(echo "$REDIS_URL" | sed -n 's|redis://[^:]*:\([0-9]*\).*|\1|p')
            redis_host=${redis_host:-localhost}
            redis_port=${redis_port:-6379}
            
            if redis-cli -h "$redis_host" -p "$redis_port" ping 2>/dev/null | grep -q PONG; then
                record_result "REDIS_CONNECTION" "PASS" "Redis connection successful"
            else
                record_result "REDIS_CONNECTION" "FAIL" "Redis connection failed"
            fi
        else
            record_result "REDIS_CONNECTION" "WARNING" "Cannot test Redis (redis-cli not available)"
        fi
    else
        record_result "REDIS_CONNECTION" "WARNING" "Redis not configured (optional)"
    fi
    
    # Test Spotify API configuration
    if [ -n "${SPOTIFY_CLIENT_ID:-}" ] && [ -n "${SPOTIFY_CLIENT_SECRET:-}" ]; then
        log_info "Testing Spotify API configuration..."
        
        # Basic validation - check if credentials are not placeholder values
        if [[ "$SPOTIFY_CLIENT_ID" != *"your_"* ]] && [[ "$SPOTIFY_CLIENT_ID" != *"demo_"* ]]; then
            record_result "SPOTIFY_CREDENTIALS" "PASS" "Spotify credentials appear to be configured"
        else
            record_result "SPOTIFY_CREDENTIALS" "WARNING" "Spotify credentials appear to be placeholder values"
        fi
    else
        record_result "SPOTIFY_CREDENTIALS" "WARNING" "Spotify API not configured (demo mode will be used)"
    fi
}

# Application Health Validation
validate_application_health() {
    log_step "Validating application health..."
    
    cd "$PROJECT_ROOT"
    
    # Check if application is currently running
    local app_port="${PORT:-3000}"
    
    if port_in_use "$app_port"; then
        record_result "APP_PORT_IN_USE" "PASS" "Port $app_port is in use (application may be running)"
        
        # Try to connect to health endpoint
        local health_url="http://localhost:$app_port/health"
        if validate_url "$health_url"; then
            record_result "APP_HEALTH_ENDPOINT" "PASS" "Health endpoint is responding"
            
            # Get health status
            local health_response=$(curl -s "$health_url" 2>/dev/null || echo '{}')
            if echo "$health_response" | jq . >/dev/null 2>&1; then
                record_result "APP_HEALTH_JSON" "PASS" "Health endpoint returns valid JSON"
            else
                record_result "APP_HEALTH_JSON" "WARNING" "Health endpoint response is not valid JSON"
            fi
        else
            record_result "APP_HEALTH_ENDPOINT" "WARNING" "Application running but health endpoint not responding"
        fi
        
        # Test main application endpoint
        local main_url="http://localhost:$app_port/"
        if validate_url "$main_url"; then
            record_result "APP_MAIN_ENDPOINT" "PASS" "Main application endpoint is responding"
        else
            record_result "APP_MAIN_ENDPOINT" "WARNING" "Main application endpoint not responding"
        fi
    else
        record_result "APP_PORT_IN_USE" "WARNING" "Application not currently running on port $app_port"
    fi
}

# Docker Configuration Validation
validate_docker_configuration() {
    if [ "$VALIDATE_DOCKER" != true ]; then
        return 0
    fi
    
    log_step "Validating Docker configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Check Dockerfile
    if [ -f "Dockerfile" ]; then
        record_result "DOCKERFILE_EXISTS" "PASS" "Dockerfile exists"
        
        # Basic Dockerfile validation
        if grep -q "FROM node:" Dockerfile; then
            record_result "DOCKERFILE_NODE_BASE" "PASS" "Dockerfile uses Node.js base image"
        else
            record_result "DOCKERFILE_NODE_BASE" "WARNING" "Dockerfile doesn't use standard Node.js base image"
        fi
        
        if grep -q "EXPOSE.*3000" Dockerfile; then
            record_result "DOCKERFILE_EXPOSE_PORT" "PASS" "Dockerfile exposes port 3000"
        else
            record_result "DOCKERFILE_EXPOSE_PORT" "WARNING" "Dockerfile doesn't expose standard port"
        fi
    else
        record_result "DOCKERFILE_EXISTS" "FAIL" "Dockerfile not found"
    fi
    
    # Check docker-compose.yml
    if [ -f "docker-compose.yml" ]; then
        record_result "DOCKER_COMPOSE_FILE" "PASS" "docker-compose.yml exists"
        
        # Validate docker-compose file
        if command_exists docker-compose; then
            if docker-compose config >/dev/null 2>&1; then
                record_result "DOCKER_COMPOSE_VALID" "PASS" "docker-compose.yml is valid"
            else
                record_result "DOCKER_COMPOSE_VALID" "FAIL" "docker-compose.yml has syntax errors"
            fi
        elif command_exists docker && docker compose version >/dev/null 2>&1; then
            if docker compose config >/dev/null 2>&1; then
                record_result "DOCKER_COMPOSE_VALID" "PASS" "docker-compose.yml is valid"
            else
                record_result "DOCKER_COMPOSE_VALID" "FAIL" "docker-compose.yml has syntax errors"
            fi
        else
            record_result "DOCKER_COMPOSE_VALID" "WARNING" "Cannot validate docker-compose.yml (docker-compose not available)"
        fi
    else
        record_result "DOCKER_COMPOSE_FILE" "WARNING" "docker-compose.yml not found (optional)"
    fi
    
    # Check if Docker containers are running
    if command_exists docker && docker ps >/dev/null 2>&1; then
        local running_containers=$(docker ps --format "table {{.Names}}" | grep -i echotune | wc -l)
        if [ "$running_containers" -gt 0 ]; then
            record_result "DOCKER_CONTAINERS_RUNNING" "PASS" "$running_containers EchoTune Docker container(s) running"
        else
            record_result "DOCKER_CONTAINERS_RUNNING" "WARNING" "No EchoTune Docker containers currently running"
        fi
    fi
}

# Nginx Configuration Validation
validate_nginx_configuration() {
    if [ "$VALIDATE_NGINX" != true ]; then
        return 0
    fi
    
    log_step "Validating Nginx configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Check for Nginx configuration files
    local nginx_configs=("nginx.conf" "nginx.conf.template")
    local found_nginx_config=false
    
    for config_file in "${nginx_configs[@]}"; do
        if [ -f "$config_file" ]; then
            record_result "NGINX_CONFIG_$config_file" "PASS" "$config_file exists"
            found_nginx_config=true
            
            # Basic nginx config validation
            if grep -q "upstream.*app" "$config_file"; then
                record_result "NGINX_UPSTREAM_CONFIG" "PASS" "Nginx upstream configuration found"
            else
                record_result "NGINX_UPSTREAM_CONFIG" "WARNING" "Nginx upstream configuration not found"
            fi
            
            if grep -q "ssl_certificate" "$config_file"; then
                record_result "NGINX_SSL_CONFIG" "PASS" "SSL configuration found in Nginx"
            else
                record_result "NGINX_SSL_CONFIG" "WARNING" "No SSL configuration found in Nginx"
            fi
            
            if grep -q "rate_limit" "$config_file" || grep -q "limit_req" "$config_file"; then
                record_result "NGINX_RATE_LIMITING" "PASS" "Rate limiting configuration found"
            else
                record_result "NGINX_RATE_LIMITING" "WARNING" "No rate limiting configuration found"
            fi
        fi
    done
    
    if [ "$found_nginx_config" = false ]; then
        record_result "NGINX_CONFIG_FILES" "WARNING" "No Nginx configuration files found"
    fi
    
    # Check if Nginx is installed and running
    if command_exists nginx; then
        record_result "NGINX_INSTALLED" "PASS" "Nginx is installed"
        
        if service_running nginx; then
            record_result "NGINX_RUNNING" "PASS" "Nginx service is running"
        else
            record_result "NGINX_RUNNING" "WARNING" "Nginx service is not running"
        fi
        
        # Test nginx configuration syntax
        if nginx -t >/dev/null 2>&1; then
            record_result "NGINX_SYNTAX" "PASS" "Nginx configuration syntax is valid"
        else
            record_result "NGINX_SYNTAX" "WARNING" "Nginx configuration has syntax issues"
        fi
    else
        record_result "NGINX_INSTALLED" "WARNING" "Nginx not installed (optional for development)"
    fi
}

# SSL Configuration Validation
validate_ssl_configuration() {
    if [ "$VALIDATE_SSL" != true ]; then
        return 0
    fi
    
    log_step "Validating SSL configuration..."
    
    # Check for SSL certificates
    local ssl_paths=(
        "/etc/letsencrypt/live"
        "/opt/echotune/ssl"
        "ssl"
        "/etc/ssl/certs"
    )
    
    local found_ssl_certs=false
    for ssl_path in "${ssl_paths[@]}"; do
        if [ -d "$ssl_path" ]; then
            local cert_count=$(find "$ssl_path" -name "*.crt" -o -name "*.pem" | wc -l)
            if [ "$cert_count" -gt 0 ]; then
                record_result "SSL_CERTIFICATES_$ssl_path" "PASS" "Found $cert_count SSL certificate(s) in $ssl_path"
                found_ssl_certs=true
            fi
        fi
    done
    
    if [ "$found_ssl_certs" = false ]; then
        record_result "SSL_CERTIFICATES" "WARNING" "No SSL certificates found (development mode or not configured)"
    fi
    
    # Check for SSL setup scripts
    local ssl_scripts=("ssl-setup.sh" "scripts/ssl-setup.sh" "scripts/ssl-manager.sh")
    local found_ssl_script=false
    
    for script in "${ssl_scripts[@]}"; do
        if [ -f "$script" ]; then
            record_result "SSL_SETUP_SCRIPT_$script" "PASS" "SSL setup script found: $script"
            found_ssl_script=true
        fi
    done
    
    if [ "$found_ssl_script" = false ]; then
        record_result "SSL_SETUP_SCRIPTS" "WARNING" "No SSL setup scripts found"
    fi
    
    # Check if domain is configured for SSL
    if [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "localhost" ]; then
        record_result "SSL_DOMAIN_CONFIG" "PASS" "Domain configured for SSL: $DOMAIN"
        
        # Test if HTTPS is working (if application is running)
        if [ -n "${PORT:-}" ]; then
            local https_url="https://$DOMAIN:${PORT:-3000}/health"
            if validate_url "$https_url"; then
                record_result "SSL_HTTPS_WORKING" "PASS" "HTTPS endpoint is accessible"
            else
                record_result "SSL_HTTPS_WORKING" "WARNING" "HTTPS endpoint not accessible (may not be configured or running)"
            fi
        fi
    else
        record_result "SSL_DOMAIN_CONFIG" "WARNING" "No domain configured for SSL (using localhost)"
    fi
}

# Documentation Validation
validate_documentation() {
    if [ "$VALIDATE_DOCS" != true ]; then
        return 0
    fi
    
    log_step "Validating documentation..."
    
    cd "$PROJECT_ROOT"
    
    # Check for main documentation files
    local main_docs=("README.md" "DEPLOYMENT_GUIDE.md" "TROUBLESHOOTING.md")
    
    for doc in "${main_docs[@]}"; do
        if file_has_content "$doc"; then
            record_result "DOCUMENTATION_$doc" "PASS" "$doc exists and has content"
        else
            record_result "DOCUMENTATION_$doc" "WARNING" "$doc missing or empty"
        fi
    done
    
    # Check for outdated documentation (many similar files might indicate duplication)
    local doc_count=$(find . -maxdepth 1 -name "*.md" | wc -l)
    if [ "$doc_count" -gt 20 ]; then
        record_result "DOCUMENTATION_QUANTITY" "WARNING" "Large number of documentation files ($doc_count) - may need cleanup"
    else
        record_result "DOCUMENTATION_QUANTITY" "PASS" "Reasonable number of documentation files ($doc_count)"
    fi
    
    # Check for deployment-specific documentation
    local deployment_docs=("DIGITALOCEAN_DEPLOYMENT.md" "PRODUCTION_DEPLOYMENT_GUIDE.md" "ENHANCED_PRODUCTION_GUIDE.md")
    local found_deployment_docs=0
    
    for doc in "${deployment_docs[@]}"; do
        if file_has_content "$doc"; then
            found_deployment_docs=$((found_deployment_docs + 1))
        fi
    done
    
    if [ "$found_deployment_docs" -gt 0 ]; then
        record_result "DEPLOYMENT_DOCUMENTATION" "PASS" "Deployment documentation available ($found_deployment_docs files)"
    else
        record_result "DEPLOYMENT_DOCUMENTATION" "WARNING" "No deployment documentation found"
    fi
}

# MCP Server Validation
validate_mcp_servers() {
    log_step "Validating MCP server integrations..."
    
    cd "$PROJECT_ROOT"
    
    # Check for MCP server directories
    local mcp_dirs=("mcp-server" "mcp-servers")
    local found_mcp=false
    
    for mcp_dir in "${mcp_dirs[@]}"; do
        if [ -d "$mcp_dir" ]; then
            record_result "MCP_DIRECTORY_$mcp_dir" "PASS" "MCP directory exists: $mcp_dir"
            found_mcp=true
            
            # Count MCP servers
            local server_count=$(find "$mcp_dir" -name "*.js" -o -name "package.json" | wc -l)
            record_result "MCP_SERVER_COUNT_$mcp_dir" "PASS" "Found $server_count MCP-related files in $mcp_dir"
        fi
    done
    
    if [ "$found_mcp" = false ]; then
        record_result "MCP_SERVERS" "WARNING" "No MCP server directories found"
    fi
    
    # Check package.json for MCP configuration
    if [ -f "package.json" ] && grep -q "mcp" package.json; then
        record_result "MCP_PACKAGE_CONFIG" "PASS" "MCP configuration found in package.json"
    else
        record_result "MCP_PACKAGE_CONFIG" "WARNING" "No MCP configuration found in package.json"
    fi
    
    # Test MCP server health if available
    if command_exists npm && [ -f "package.json" ]; then
        if npm run mcp:health >/dev/null 2>&1; then
            record_result "MCP_HEALTH_CHECK" "PASS" "MCP health check passed"
        else
            record_result "MCP_HEALTH_CHECK" "WARNING" "MCP health check failed or not available"
        fi
    fi
}

# Deployment Scripts Validation
validate_deployment_scripts() {
    log_step "Validating deployment scripts..."
    
    cd "$PROJECT_ROOT"
    
    # Check for main deployment scripts
    local deployment_scripts=(
        "install-modern.sh"
        "deploy-one-click.sh"
        "validate-deployment.sh"
        "scripts/deploy.sh"
        "scripts/deploy-digitalocean.sh"
        "scripts/ssl-setup.sh"
    )
    
    for script in "${deployment_scripts[@]}"; do
        if [ -f "$script" ]; then
            if [ -x "$script" ]; then
                record_result "DEPLOY_SCRIPT_$script" "PASS" "$script exists and is executable"
            else
                record_result "DEPLOY_SCRIPT_$script" "WARNING" "$script exists but is not executable"
            fi
            
            # Basic script validation
            if head -1 "$script" | grep -q "#!/bin/bash"; then
                record_result "DEPLOY_SCRIPT_SHEBANG_$script" "PASS" "$script has proper shebang"
            else
                record_result "DEPLOY_SCRIPT_SHEBANG_$script" "WARNING" "$script may be missing proper shebang"
            fi
        else
            record_result "DEPLOY_SCRIPT_$script" "WARNING" "$script not found"
        fi
    done
    
    # Check for DigitalOcean configuration
    if [ -f ".do/app.yaml" ]; then
        record_result "DIGITALOCEAN_CONFIG" "PASS" "DigitalOcean app.yaml configuration exists"
    else
        record_result "DIGITALOCEAN_CONFIG" "WARNING" "DigitalOcean app.yaml not found"
    fi
    
    # Check for GitHub deployment workflows
    if [ -d ".github/workflows" ]; then
        local workflow_count=$(find ".github/workflows" -name "*.yml" -o -name "*.yaml" | wc -l)
        record_result "GITHUB_WORKFLOWS" "PASS" "Found $workflow_count GitHub workflow(s)"
    else
        record_result "GITHUB_WORKFLOWS" "WARNING" "No GitHub workflows found"
    fi
}

# Generate comprehensive report
generate_report() {
    log_step "Generating comprehensive validation report..."
    
    local report_file="$PROJECT_ROOT/deployment-validation-report-$TIMESTAMP.md"
    
    cat > "$report_file" << EOF
# EchoTune AI - Deployment Validation Report

**Generated:** $(date)  
**Environment:** $TARGET_ENVIRONMENT  
**Validator Version:** Comprehensive v1.0  

## Summary

- **Total Checks:** $TOTAL_CHECKS
- **Passed:** $PASSED_CHECKS ($(( PASSED_CHECKS * 100 / TOTAL_CHECKS ))%)
- **Failed:** $FAILED_CHECKS ($(( FAILED_CHECKS * 100 / TOTAL_CHECKS ))%)
- **Warnings:** $WARNING_CHECKS ($(( WARNING_CHECKS * 100 / TOTAL_CHECKS ))%)

## Detailed Results

EOF
    
    # Sort results by category
    local categories=("SYSTEM" "ENV" "DEPENDENCIES" "SERVICES" "DOCKER" "NGINX" "SSL" "MCP" "DEPLOY" "DOCS")
    
    for category in "${categories[@]}"; do
        echo "### $category" >> "$report_file"
        echo "" >> "$report_file"
        
        local found_in_category=false
        for check_name in "${!VALIDATION_RESULTS[@]}"; do
            if [[ "$check_name" == *"$category"* ]] || 
               [[ "$check_name" == "OS_"* && "$category" == "SYSTEM" ]] ||
               [[ "$check_name" == "NODEJS_"* && "$category" == "SYSTEM" ]] ||
               [[ "$check_name" == "PYTHON_"* && "$category" == "SYSTEM" ]] ||
               [[ "$check_name" == "ENV_"* && "$category" == "ENV" ]] ||
               [[ "$check_name" == "PACKAGE_"* && "$category" == "DEPENDENCIES" ]] ||
               [[ "$check_name" == "NODE_MODULES"* && "$category" == "DEPENDENCIES" ]] ||
               [[ "$check_name" == "*CONNECTION"* && "$category" == "SERVICES" ]] ||
               [[ "$check_name" == "APP_"* && "$category" == "SERVICES" ]]; then
                
                local result="${VALIDATION_RESULTS[$check_name]}"
                local status="${result%%:*}"
                local message="${result#*:}"
                
                local emoji="❓"
                case "$status" in
                    "PASS") emoji="✅" ;;
                    "FAIL") emoji="❌" ;;
                    "WARNING") emoji="⚠️" ;;
                esac
                
                echo "- $emoji **$check_name**: $message" >> "$report_file"
                found_in_category=true
            fi
        done
        
        if [ "$found_in_category" = false ]; then
            echo "- No checks performed in this category" >> "$report_file"
        fi
        
        echo "" >> "$report_file"
    done
    
    # Add recommendations
    cat >> "$report_file" << EOF
## Recommendations

### Critical Issues (Must Fix)
EOF
    
    local critical_issues=false
    for check_name in "${!VALIDATION_RESULTS[@]}"; do
        local result="${VALIDATION_RESULTS[$check_name]}"
        local status="${result%%:*}"
        local message="${result#*:}"
        
        if [ "$status" = "FAIL" ]; then
            echo "- **$check_name**: $message" >> "$report_file"
            critical_issues=true
        fi
    done
    
    if [ "$critical_issues" = false ]; then
        echo "- No critical issues found! 🎉" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

### Warnings (Recommended Fixes)
EOF
    
    local warnings_found=false
    for check_name in "${!VALIDATION_RESULTS[@]}"; do
        local result="${VALIDATION_RESULTS[$check_name]}"
        local status="${result%%:*}"
        local message="${result#*:}"
        
        if [ "$status" = "WARNING" ]; then
            echo "- **$check_name**: $message" >> "$report_file"
            warnings_found=true
        fi
    done
    
    if [ "$warnings_found" = false ]; then
        echo "- No warnings found! 🎉" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

## Quick Fix Commands

\`\`\`bash
# Install missing system dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip docker.io docker-compose

# Install project dependencies
npm install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Test deployment
./validate-deployment.sh
\`\`\`

## Next Steps

1. Fix all critical issues (FAIL status)
2. Address warnings for optimal deployment
3. Run deployment validation again
4. Test in target environment
5. Monitor after deployment

---
*Report generated by EchoTune AI Comprehensive Deployment Validator*
EOF
    
    log_success "Comprehensive report generated: $report_file"
    echo "$report_file"
}

# Interactive mode
interactive_mode() {
    print_header
    
    echo -e "${COLORS[CYAN]}🎯 Interactive Deployment Validation Mode${COLORS[NC]}"
    echo ""
    
    # Get validation preferences
    echo -e "${COLORS[YELLOW]}Which components would you like to validate?${COLORS[NC]}"
    echo ""
    echo "1) Full validation (recommended)"
    echo "2) Basic validation (system + environment)"
    echo "3) Production validation (all services + security)"
    echo "4) Development validation (basic + dependencies)"
    echo "5) Custom validation (select components)"
    echo ""
    
    read -p "Select validation type (1-5): " -n 1 -r validation_type
    echo ""
    echo ""
    
    case "$validation_type" in
        1)
            VALIDATE_ALL=true
            VALIDATE_DEPLOYMENT=true
            VALIDATE_ENV=true
            VALIDATE_SERVICES=true
            VALIDATE_NGINX=true
            VALIDATE_SSL=true
            VALIDATE_DOCKER=true
            VALIDATE_DOCS=true
            ;;
        2)
            VALIDATE_DEPLOYMENT=false
            VALIDATE_ENV=true
            VALIDATE_SERVICES=false
            VALIDATE_NGINX=false
            VALIDATE_SSL=false
            VALIDATE_DOCKER=false
            VALIDATE_DOCS=false
            ;;
        3)
            TARGET_ENVIRONMENT="production"
            VALIDATE_DEPLOYMENT=true
            VALIDATE_ENV=true
            VALIDATE_SERVICES=true
            VALIDATE_NGINX=true
            VALIDATE_SSL=true
            VALIDATE_DOCKER=true
            VALIDATE_DOCS=false
            ;;
        4)
            TARGET_ENVIRONMENT="development"
            VALIDATE_DEPLOYMENT=true
            VALIDATE_ENV=true
            VALIDATE_SERVICES=true
            VALIDATE_NGINX=false
            VALIDATE_SSL=false
            VALIDATE_DOCKER=true
            VALIDATE_DOCS=false
            ;;
        5)
            echo -e "${COLORS[CYAN]}Select components to validate:${COLORS[NC]}"
            echo ""
            
            read -p "Validate deployment scripts? (y/N): " -n 1 -r
            echo ""
            [[ $REPLY =~ ^[Yy]$ ]] && VALIDATE_DEPLOYMENT=true || VALIDATE_DEPLOYMENT=false
            
            read -p "Validate environment configuration? (y/N): " -n 1 -r
            echo ""
            [[ $REPLY =~ ^[Yy]$ ]] && VALIDATE_ENV=true || VALIDATE_ENV=false
            
            read -p "Validate service integrations? (y/N): " -n 1 -r
            echo ""
            [[ $REPLY =~ ^[Yy]$ ]] && VALIDATE_SERVICES=true || VALIDATE_SERVICES=false
            
            read -p "Validate Docker configuration? (y/N): " -n 1 -r
            echo ""
            [[ $REPLY =~ ^[Yy]$ ]] && VALIDATE_DOCKER=true || VALIDATE_DOCKER=false
            
            read -p "Validate Nginx configuration? (y/N): " -n 1 -r
            echo ""
            [[ $REPLY =~ ^[Yy]$ ]] && VALIDATE_NGINX=true || VALIDATE_NGINX=false
            
            read -p "Validate SSL configuration? (y/N): " -n 1 -r
            echo ""
            [[ $REPLY =~ ^[Yy]$ ]] && VALIDATE_SSL=true || VALIDATE_SSL=false
            
            read -p "Validate documentation? (y/N): " -n 1 -r
            echo ""
            [[ $REPLY =~ ^[Yy]$ ]] && VALIDATE_DOCS=true || VALIDATE_DOCS=false
            ;;
        *)
            log_warning "Invalid selection, using full validation"
            VALIDATE_ALL=true
            ;;
    esac
    
    # Get domain if validating production components
    if [ "$VALIDATE_SSL" = true ] || [ "$VALIDATE_NGINX" = true ]; then
        echo ""
        read -p "Enter domain name (press Enter for localhost): " domain_input
        if [ -n "$domain_input" ]; then
            DOMAIN="$domain_input"
            export DOMAIN="$domain_input"
        fi
    fi
    
    # Ask about auto-fixing
    echo ""
    read -p "Attempt to auto-fix issues where possible? (y/N): " -n 1 -r
    echo ""
    [[ $REPLY =~ ^[Yy]$ ]] && FIX_ISSUES=true || FIX_ISSUES=false
    
    echo ""
}

# Auto-fix function
auto_fix_issues() {
    if [ "$FIX_ISSUES" != true ]; then
        return 0
    fi
    
    log_step "Attempting to auto-fix common issues..."
    
    cd "$PROJECT_ROOT"
    
    # Create .env from example if missing
    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        cp .env.example .env
        log_success "Created .env from .env.example"
    fi
    
    # Install npm dependencies if missing
    if [ ! -d "node_modules" ] && [ -f "package.json" ]; then
        log_info "Installing npm dependencies..."
        if npm install; then
            log_success "npm dependencies installed"
        else
            log_warning "Failed to install npm dependencies"
        fi
    fi
    
    # Create Python virtual environment if missing
    if [ ! -d "venv" ] && [ -f "requirements.txt" ] && command_exists python3; then
        log_info "Creating Python virtual environment..."
        if python3 -m venv venv; then
            log_success "Python virtual environment created"
            
            # Install Python dependencies
            if source venv/bin/activate && pip install -r requirements.txt; then
                log_success "Python dependencies installed"
            else
                log_warning "Failed to install Python dependencies"
            fi
        else
            log_warning "Failed to create Python virtual environment"
        fi
    fi
    
    # Make deployment scripts executable
    local scripts=("install-modern.sh" "deploy-one-click.sh" "validate-deployment.sh")
    for script in "${scripts[@]}"; do
        if [ -f "$script" ] && [ ! -x "$script" ]; then
            chmod +x "$script"
            log_success "Made $script executable"
        fi
    done
}

# Main execution function
main() {
    # Initialize temp directory
    mkdir -p "$TEMP_DIR"
    
    # Initialize log file
    echo "EchoTune AI Deployment Validation - $(date)" > "$VALIDATION_LOG"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --interactive)
                INTERACTIVE_MODE=true
                shift
                ;;
            --production)
                TARGET_ENVIRONMENT="production"
                VALIDATE_SSL=true
                VALIDATE_NGINX=true
                shift
                ;;
            --development)
                TARGET_ENVIRONMENT="development"
                VALIDATE_SSL=false
                shift
                ;;
            --all)
                VALIDATE_ALL=true
                VALIDATE_DEPLOYMENT=true
                VALIDATE_ENV=true
                VALIDATE_SERVICES=true
                VALIDATE_NGINX=true
                VALIDATE_SSL=true
                VALIDATE_DOCKER=true
                VALIDATE_DOCS=true
                shift
                ;;
            --fix)
                FIX_ISSUES=true
                shift
                ;;
            --domain)
                DOMAIN="$2"
                export DOMAIN="$2"
                shift 2
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Run interactive mode if requested
    if [ "$INTERACTIVE_MODE" = true ]; then
        interactive_mode
    else
        print_header
    fi
    
    # Start validation
    log_info "Starting comprehensive deployment validation..."
    log_info "Validation settings:"
    echo "  - Environment: $TARGET_ENVIRONMENT"
    echo "  - Validate Deployment: $VALIDATE_DEPLOYMENT"
    echo "  - Validate Environment: $VALIDATE_ENV"
    echo "  - Validate Services: $VALIDATE_SERVICES"
    echo "  - Validate Docker: $VALIDATE_DOCKER"
    echo "  - Validate Nginx: $VALIDATE_NGINX"
    echo "  - Validate SSL: $VALIDATE_SSL"
    echo "  - Validate Documentation: $VALIDATE_DOCS"
    echo "  - Auto-fix Issues: $FIX_ISSUES"
    echo ""
    
    # Run validation functions
    validate_system_requirements
    
    if [ "$VALIDATE_ENV" = true ]; then
        validate_environment_config
    fi
    
    validate_dependencies
    
    if [ "$VALIDATE_SERVICES" = true ]; then
        validate_service_integrations
        validate_application_health
    fi
    
    validate_mcp_servers
    
    if [ "$VALIDATE_DEPLOYMENT" = true ]; then
        validate_deployment_scripts
    fi
    
    if [ "$VALIDATE_DOCKER" = true ]; then
        validate_docker_configuration
    fi
    
    if [ "$VALIDATE_NGINX" = true ]; then
        validate_nginx_configuration
    fi
    
    if [ "$VALIDATE_SSL" = true ]; then
        validate_ssl_configuration
    fi
    
    if [ "$VALIDATE_DOCS" = true ]; then
        validate_documentation
    fi
    
    # Auto-fix issues if requested
    auto_fix_issues
    
    # Generate report
    local report_file
    report_file=$(generate_report)
    
    # Display summary
    echo ""
    echo -e "${COLORS[BOLD]}╔══════════════════════════════════════════════════════════════════════════════╗${COLORS[NC]}"
    echo -e "${COLORS[BOLD]}║                          VALIDATION SUMMARY                               ║${COLORS[NC]}"
    echo -e "${COLORS[BOLD]}╚══════════════════════════════════════════════════════════════════════════════╝${COLORS[NC]}"
    echo ""
    
    local success_rate=$(( PASSED_CHECKS * 100 / TOTAL_CHECKS ))
    
    echo -e "${COLORS[CYAN]}📊 Results Overview:${COLORS[NC]}"
    echo "   Total Checks: $TOTAL_CHECKS"
    echo -e "   ${COLORS[GREEN]}✅ Passed: $PASSED_CHECKS ($success_rate%)${COLORS[NC]}"
    echo -e "   ${COLORS[RED]}❌ Failed: $FAILED_CHECKS${COLORS[NC]}"
    echo -e "   ${COLORS[YELLOW]}⚠️  Warnings: $WARNING_CHECKS${COLORS[NC]}"
    echo ""
    
    if [ $FAILED_CHECKS -eq 0 ]; then
        if [ $WARNING_CHECKS -eq 0 ]; then
            echo -e "${COLORS[GREEN]}🎉 Perfect! All validations passed without issues!${COLORS[NC]}"
            echo -e "${COLORS[GREEN]}✅ Your EchoTune AI deployment is ready for production!${COLORS[NC]}"
        else
            echo -e "${COLORS[YELLOW]}⚠️  Good! No critical issues found, but there are $WARNING_CHECKS warnings to consider.${COLORS[NC]}"
            echo -e "${COLORS[GREEN]}✅ Your EchoTune AI deployment should work but could be optimized.${COLORS[NC]}"
        fi
    else
        echo -e "${COLORS[RED]}❌ Issues found! $FAILED_CHECKS critical issue(s) need to be fixed.${COLORS[NC]}"
        echo -e "${COLORS[YELLOW]}⚠️  Please review the detailed report and fix critical issues before deployment.${COLORS[NC]}"
    fi
    
    echo ""
    echo -e "${COLORS[CYAN]}📄 Detailed report: ${COLORS[WHITE]}$report_file${COLORS[NC]}"
    echo -e "${COLORS[CYAN]}📝 Full log: ${COLORS[WHITE]}$VALIDATION_LOG${COLORS[NC]}"
    echo ""
    
    # Cleanup
    cleanup_temp_files
    
    # Exit with appropriate code
    if [ $FAILED_CHECKS -gt 0 ]; then
        exit 1
    elif [ $WARNING_CHECKS -gt 0 ]; then
        exit 2  # Warnings present
    else
        exit 0  # All good
    fi
}

# Help function
show_help() {
    cat << EOF
EchoTune AI - Comprehensive Deployment Validator

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --interactive          Run in interactive mode
    --production          Validate for production deployment
    --development         Validate for development environment
    --all                 Perform all validation checks
    --fix                 Attempt to auto-fix common issues
    --domain DOMAIN       Specify domain for SSL/Nginx validation
    --help                Show this help message

EXAMPLES:
    $0                               # Basic validation
    $0 --interactive                 # Interactive mode
    $0 --production --domain app.com # Production validation
    $0 --all --fix                   # Full validation with auto-fix
    $0 --development                 # Development environment

EXIT CODES:
    0    All validations passed
    1    Critical issues found (must fix)
    2    Warnings present (recommended to fix)

For more information, visit: https://github.com/dzp5103/Spotify-echo
EOF
}

# Run main function
main "$@"