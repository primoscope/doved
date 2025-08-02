#!/bin/bash

# Production Deployment Script for EchoTune AI
# Automated deployment with comprehensive validation and rollback capabilities

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_LOG="/var/log/echotune-deploy.log"
BACKUP_DIR="/opt/echotune/backups"
TEMP_DIR="/tmp/echotune-deploy-$$"

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
fi

# Default configuration
DOMAIN="${DOMAIN:-localhost}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"
DEPLOY_MODE="${DEPLOY_MODE:-docker}" # docker, systemd, or manual
BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"
RUN_HEALTH_CHECKS="${RUN_HEALTH_CHECKS:-true}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" | tee -a "$DEPLOY_LOG"
}

# Print colored output
print_status() {
    local status="$1"
    local message="$2"
    
    case "$status" in
        "SUCCESS")
            echo -e "${GREEN}✓ SUCCESS${NC}: $message"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠ WARNING${NC}: $message"
            ;;
        "ERROR")
            echo -e "${RED}✗ ERROR${NC}: $message"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ INFO${NC}: $message"
            ;;
    esac
}

# Error handling with cleanup
error_exit() {
    local error_message="$1"
    local exit_code="${2:-1}"
    
    print_status "ERROR" "$error_message"
    log "ERROR" "$error_message"
    
    # Cleanup
    cleanup
    
    # Rollback if enabled
    if [[ "$ROLLBACK_ON_FAILURE" == "true" ]] && [[ -f "$BACKUP_DIR/current_backup.tar.gz" ]]; then
        print_status "INFO" "Attempting rollback..."
        rollback_deployment
    fi
    
    exit "$exit_code"
}

# Cleanup function
cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
        log "INFO" "Cleaned up temporary directory: $TEMP_DIR"
    fi
}

# Trap for cleanup
trap cleanup EXIT

# Check prerequisites
check_prerequisites() {
    print_status "INFO" "Checking deployment prerequisites..."
    
    # Check if running as root for system operations
    if [[ $EUID -ne 0 ]] && [[ "$DEPLOY_MODE" != "docker" ]]; then
        error_exit "This script must be run as root for system deployment"
    fi
    
    # Check required commands
    local required_commands=("git" "curl" "tar")
    
    if [[ "$DEPLOY_MODE" == "docker" ]]; then
        required_commands+=("docker" "docker-compose")
    elif [[ "$DEPLOY_MODE" == "systemd" ]]; then
        required_commands+=("systemctl" "nginx")
    fi
    
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error_exit "Required command not found: $cmd"
        fi
    done
    
    # Check disk space (require at least 2GB free)
    local available_space
    available_space=$(df / | awk 'NR==2 {print $4}')
    if [[ "$available_space" -lt 2000000 ]]; then
        error_exit "Insufficient disk space. At least 2GB required."
    fi
    
    print_status "SUCCESS" "Prerequisites check completed"
}

# Create backup
create_backup() {
    if [[ "$BACKUP_BEFORE_DEPLOY" != "true" ]]; then
        return 0
    fi
    
    print_status "INFO" "Creating deployment backup..."
    
    mkdir -p "$BACKUP_DIR"
    local backup_file="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    # Backup application directory if it exists
    if [[ -d "/opt/echotune" ]]; then
        tar -czf "$backup_file" -C /opt echotune 2>/dev/null || true
    fi
    
    # Create symlink to current backup for rollback
    ln -sf "$backup_file" "$BACKUP_DIR/current_backup.tar.gz"
    
    # Keep only last 5 backups
    cd "$BACKUP_DIR"
    ls -t backup-*.tar.gz | tail -n +6 | xargs rm -f 2>/dev/null || true
    
    print_status "SUCCESS" "Backup created: $backup_file"
}

# Rollback deployment
rollback_deployment() {
    print_status "INFO" "Rolling back deployment..."
    
    if [[ ! -f "$BACKUP_DIR/current_backup.tar.gz" ]]; then
        print_status "ERROR" "No backup found for rollback"
        return 1
    fi
    
    # Stop services
    stop_services
    
    # Restore from backup
    cd /opt
    tar -xzf "$BACKUP_DIR/current_backup.tar.gz"
    
    # Start services
    start_services
    
    print_status "SUCCESS" "Rollback completed"
}

# Prepare deployment environment
prepare_environment() {
    print_status "INFO" "Preparing deployment environment..."
    
    # Create necessary directories
    mkdir -p /opt/echotune
    mkdir -p /var/log/echotune
    mkdir -p "$TEMP_DIR"
    
    # Set up temporary directory
    cd "$TEMP_DIR"
    
    # Copy application files
    cp -r "$PROJECT_ROOT"/* .
    
    # Validate environment configuration
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.production.example" ]]; then
            print_status "WARNING" "No .env file found, using .env.production.example"
            cp .env.production.example .env
        else
            error_exit "No environment configuration found"
        fi
    fi
    
    # Validate critical environment variables
    source .env
    
    if [[ -z "${DOMAIN:-}" ]]; then
        error_exit "DOMAIN must be set in environment configuration"
    fi
    
    print_status "SUCCESS" "Environment preparation completed"
}

# Install dependencies
install_dependencies() {
    print_status "INFO" "Installing application dependencies..."
    
    cd "$TEMP_DIR"
    
    # Install Node.js dependencies
    if [[ -f "package.json" ]]; then
        npm ci --only=production --no-audit --no-fund
        print_status "SUCCESS" "Node.js dependencies installed"
    fi
    
    # Install Python dependencies
    if [[ -f "requirements-production.txt" ]]; then
        if command -v python3 &> /dev/null; then
            python3 -m pip install -r requirements-production.txt
            print_status "SUCCESS" "Python dependencies installed"
        else
            print_status "WARNING" "Python3 not found, skipping Python dependencies"
        fi
    fi
}

# Setup SSL certificates
setup_ssl() {
    print_status "INFO" "Setting up SSL certificates..."
    
    # Use SSL manager script
    if [[ -f "$PROJECT_ROOT/scripts/ssl-manager.sh" ]]; then
        if [[ "$DOMAIN" != "localhost" ]] && [[ "$DOMAIN" != *.local ]]; then
            "$PROJECT_ROOT/scripts/ssl-manager.sh" generate "$DOMAIN" "$EMAIL"
        else
            print_status "INFO" "Skipping SSL setup for localhost/local domain"
        fi
    else
        print_status "WARNING" "SSL manager script not found"
    fi
}

# Deploy with Docker
deploy_docker() {
    print_status "INFO" "Deploying with Docker..."
    
    cd "$TEMP_DIR"
    
    # Build and start services
    docker-compose down --remove-orphans 2>/dev/null || true
    docker-compose build --no-cache
    docker-compose up -d
    
    # Wait for services to start
    sleep 30
    
    print_status "SUCCESS" "Docker deployment completed"
}

# Deploy with systemd
deploy_systemd() {
    print_status "INFO" "Deploying with systemd..."
    
    # Stop existing services
    stop_services
    
    # Copy application files
    rsync -av --delete "$TEMP_DIR/" /opt/echotune/
    
    # Set up systemd service
    if [[ -f "/opt/echotune/echotune.service" ]]; then
        cp /opt/echotune/echotune.service /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable echotune
    fi
    
    # Configure Nginx
    if [[ -f "/opt/echotune/nginx.conf" ]]; then
        # Process Nginx configuration with environment variables
        envsubst < /opt/echotune/nginx.conf > /etc/nginx/sites-available/echotune
        ln -sf /etc/nginx/sites-available/echotune /etc/nginx/sites-enabled/
        nginx -t || error_exit "Nginx configuration test failed"
    fi
    
    # Start services
    start_services
    
    print_status "SUCCESS" "Systemd deployment completed"
}

# Deploy manually
deploy_manual() {
    print_status "INFO" "Deploying manually..."
    
    # Copy application files
    rsync -av --delete "$TEMP_DIR/" /opt/echotune/
    
    print_status "SUCCESS" "Manual deployment completed"
    print_status "INFO" "Please start services manually"
}

# Stop services
stop_services() {
    case "$DEPLOY_MODE" in
        "docker")
            cd "$PROJECT_ROOT"
            docker-compose down 2>/dev/null || true
            ;;
        "systemd")
            systemctl stop echotune 2>/dev/null || true
            systemctl stop nginx 2>/dev/null || true
            ;;
        "manual")
            print_status "INFO" "Please stop services manually"
            ;;
    esac
}

# Start services
start_services() {
    case "$DEPLOY_MODE" in
        "docker")
            cd /opt/echotune
            docker-compose up -d
            ;;
        "systemd")
            systemctl start echotune
            systemctl start nginx
            ;;
        "manual")
            print_status "INFO" "Please start services manually"
            ;;
    esac
}

# Run health checks
run_health_checks() {
    if [[ "$RUN_HEALTH_CHECKS" != "true" ]]; then
        return 0
    fi
    
    print_status "INFO" "Running post-deployment health checks..."
    
    # Wait for services to fully start
    sleep 30
    
    # Use health check script if available
    if [[ -f "$PROJECT_ROOT/scripts/health-check.sh" ]]; then
        if "$PROJECT_ROOT/scripts/health-check.sh" all; then
            print_status "SUCCESS" "Health checks passed"
        else
            error_exit "Health checks failed"
        fi
    else
        # Basic HTTP health check
        local url="http://localhost:3000/health"
        if [[ "$DOMAIN" != "localhost" ]]; then
            url="https://$DOMAIN/health"
        fi
        
        if curl -f "$url" >/dev/null 2>&1; then
            print_status "SUCCESS" "Basic health check passed"
        else
            error_exit "Basic health check failed"
        fi
    fi
}

# Main deployment function
deploy() {
    local start_time=$(date +%s)
    
    print_status "INFO" "Starting EchoTune AI deployment..."
    log "INFO" "Deployment started with mode: $DEPLOY_MODE"
    
    # Create deployment log directory
    mkdir -p "$(dirname "$DEPLOY_LOG")"
    
    # Run deployment steps
    check_prerequisites
    create_backup
    prepare_environment
    install_dependencies
    setup_ssl
    
    # Deploy based on mode
    case "$DEPLOY_MODE" in
        "docker")
            deploy_docker
            ;;
        "systemd")
            deploy_systemd
            ;;
        "manual")
            deploy_manual
            ;;
        *)
            error_exit "Unknown deployment mode: $DEPLOY_MODE"
            ;;
    esac
    
    # Post-deployment checks
    run_health_checks
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    print_status "SUCCESS" "Deployment completed successfully in ${duration}s"
    log "INFO" "Deployment completed successfully in ${duration}s"
    
    # Display access information
    echo ""
    print_status "INFO" "EchoTune AI is now available at:"
    if [[ "$DOMAIN" != "localhost" ]]; then
        echo "  HTTPS: https://$DOMAIN"
        echo "  HTTP:  http://$DOMAIN (redirects to HTTPS)"
    else
        echo "  HTTP:  http://localhost:3000"
    fi
    echo ""
}

# Show help
show_help() {
    cat << EOF
EchoTune AI Production Deployment Script

Usage: $0 [options]

Options:
    -m, --mode MODE         Deployment mode (docker, systemd, manual) [default: docker]
    -d, --domain DOMAIN     Domain name [default: localhost]
    -e, --email EMAIL       Email for SSL certificates [default: admin@domain]
    --no-backup            Skip backup before deployment
    --no-health-checks     Skip health checks after deployment
    --no-rollback          Disable automatic rollback on failure
    -h, --help             Show this help message

Environment Variables:
    DOMAIN                 Domain name
    LETSENCRYPT_EMAIL     Email for Let's Encrypt
    DEPLOY_MODE           Deployment mode
    BACKUP_BEFORE_DEPLOY  Create backup before deployment (true/false)
    RUN_HEALTH_CHECKS     Run health checks after deployment (true/false)
    ROLLBACK_ON_FAILURE   Rollback on deployment failure (true/false)

Examples:
    $0                                    # Deploy with Docker (default)
    $0 -m systemd -d example.com         # Deploy with systemd
    $0 --mode manual --no-backup         # Manual deployment without backup

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--mode)
                DEPLOY_MODE="$2"
                shift 2
                ;;
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            -e|--email)
                EMAIL="$2"
                shift 2
                ;;
            --no-backup)
                BACKUP_BEFORE_DEPLOY="false"
                shift
                ;;
            --no-health-checks)
                RUN_HEALTH_CHECKS="false"
                shift
                ;;
            --no-rollback)
                ROLLBACK_ON_FAILURE="false"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    parse_arguments "$@"
    deploy
}

# Execute main function with all arguments
main "$@"