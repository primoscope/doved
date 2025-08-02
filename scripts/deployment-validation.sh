#!/bin/bash

# Production Deployment Validation Script for EchoTune AI
# Validates deployment configuration, environment, and system readiness

set -euo pipefail

# Configuration
PROJECT_DIR="/opt/echotune"
ENV_FILE="${PROJECT_DIR}/.env"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"
NGINX_CONF="${PROJECT_DIR}/nginx.conf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validation results
declare -A VALIDATIONS
OVERALL_STATUS="VALID"

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓ $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠ WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗ ERROR: $1${NC}"
    OVERALL_STATUS="INVALID"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ INFO: $1${NC}"
}

# Check if running as appropriate user
check_user() {
    local check_name="user_check"
    info "Checking user privileges..."
    
    if [[ $EUID -eq 0 ]]; then
        warn "Running as root - consider using dedicated user for production"
        VALIDATIONS[$check_name]="WARN"
    else
        log "Running as non-root user: $(whoami)"
        VALIDATIONS[$check_name]="PASS"
    fi
}

# Validate environment file
validate_environment() {
    local check_name="environment"
    info "Validating environment configuration..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file not found: $ENV_FILE"
        VALIDATIONS[$check_name]="FAIL"
        return
    fi
    
    # Required environment variables
    local required_vars=(
        "NODE_ENV"
        "PORT"
        "DOMAIN"
        "SPOTIFY_CLIENT_ID"
        "SPOTIFY_CLIENT_SECRET" 
        "SPOTIFY_REDIRECT_URI"
        "SESSION_SECRET"
        "JWT_SECRET"
        "LETSENCRYPT_EMAIL"
    )
    
    local missing_vars=()
    local weak_secrets=()
    
    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" "$ENV_FILE"; then
            local value=$(grep "^${var}=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
            
            if [[ -z "$value" ]] || [[ "$value" == "your_"* ]] || [[ "$value" == "change_me" ]]; then
                missing_vars+=("$var")
            elif [[ "$var" == *"SECRET"* ]] && [[ ${#value} -lt 32 ]]; then
                weak_secrets+=("$var")
            fi
        else
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        error "Missing or invalid required environment variables: ${missing_vars[*]}"
        VALIDATIONS[$check_name]="FAIL"
        return
    fi
    
    if [[ ${#weak_secrets[@]} -gt 0 ]]; then
        warn "Weak secrets detected (should be 32+ characters): ${weak_secrets[*]}"
        VALIDATIONS[$check_name]="WARN"
    else
        log "Environment configuration is valid"
        VALIDATIONS[$check_name]="PASS"
    fi
    
    # Check NODE_ENV
    local node_env=$(grep "^NODE_ENV=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [[ "$node_env" != "production" ]]; then
        warn "NODE_ENV is not set to 'production': $node_env"
    fi
    
    # Check domain configuration
    local domain=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [[ "$domain" == "primosphere.studio" ]]; then
        log "Domain correctly configured: $domain"
    else
        warn "Domain may not be correctly configured: $domain"
    fi
}

# Validate Docker configuration
validate_docker() {
    local check_name="docker"
    info "Validating Docker configuration..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        VALIDATIONS[$check_name]="FAIL"
        return
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        VALIDATIONS[$check_name]="FAIL"
        return
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "docker-compose is not available"
        VALIDATIONS[$check_name]="FAIL"
        return
    fi
    
    # Validate docker-compose.yml
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        error "docker-compose.yml not found: $COMPOSE_FILE"
        VALIDATIONS[$check_name]="FAIL"
        return
    fi
    
    # Test docker-compose configuration
    if cd "$PROJECT_DIR" && docker-compose config &> /dev/null; then
        log "Docker and docker-compose configuration is valid"
        VALIDATIONS[$check_name]="PASS"
    else
        error "Invalid docker-compose.yml configuration"
        VALIDATIONS[$check_name]="FAIL"
    fi
}

# Validate Nginx configuration
validate_nginx() {
    local check_name="nginx"
    info "Validating Nginx configuration..."
    
    if [[ ! -f "$NGINX_CONF" ]]; then
        error "Nginx configuration not found: $NGINX_CONF"
        VALIDATIONS[$check_name]="FAIL"
        return
    fi
    
    # Test nginx configuration syntax
    if docker run --rm -v "$NGINX_CONF:/etc/nginx/nginx.conf:ro" nginx:alpine nginx -t &> /dev/null; then
        log "Nginx configuration syntax is valid"
        VALIDATIONS[$check_name]="PASS"
    else
        error "Invalid Nginx configuration syntax"
        VALIDATIONS[$check_name]="FAIL"
        return
    fi
    
    # Check SSL configuration
    if grep -q "ssl_certificate.*letsencrypt" "$NGINX_CONF"; then
        log "SSL configuration uses Let's Encrypt certificates"
    else
        warn "SSL configuration may not be using Let's Encrypt"
    fi
    
    # Check security headers
    local security_headers=(
        "X-Frame-Options"
        "X-Content-Type-Options"
        "Strict-Transport-Security"
        "Content-Security-Policy"
    )
    
    for header in "${security_headers[@]}"; do
        if grep -q "$header" "$NGINX_CONF"; then
            log "Security header configured: $header"
        else
            warn "Missing security header: $header"
        fi
    done
}

# Validate SSL certificate setup
validate_ssl() {
    local check_name="ssl"
    info "Validating SSL certificate setup..."
    
    local domain="primosphere.studio"
    local cert_dir="/etc/letsencrypt/live/$domain"
    
    # Check if Certbot is installed
    if ! command -v certbot &> /dev/null; then
        warn "Certbot is not installed - SSL certificates need manual setup"
        VALIDATIONS[$check_name]="WARN"
        return
    fi
    
    # Check certificate files
    if [[ -d "$cert_dir" ]]; then
        local cert_files=("fullchain.pem" "privkey.pem" "chain.pem")
        local missing_files=()
        
        for cert_file in "${cert_files[@]}"; do
            if [[ ! -f "$cert_dir/$cert_file" ]]; then
                missing_files+=("$cert_file")
            fi
        done
        
        if [[ ${#missing_files[@]} -eq 0 ]]; then
            # Check certificate expiry
            local expiry_date=$(openssl x509 -in "$cert_dir/fullchain.pem" -text -noout | grep "Not After" | cut -d: -f2- | xargs)
            local expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || echo "0")
            local current_epoch=$(date +%s)
            local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
            
            if [[ $days_until_expiry -gt 30 ]]; then
                log "SSL certificates are valid and expire in $days_until_expiry days"
                VALIDATIONS[$check_name]="PASS"
            elif [[ $days_until_expiry -gt 0 ]]; then
                warn "SSL certificates expire in $days_until_expiry days"
                VALIDATIONS[$check_name]="WARN"
            else
                error "SSL certificates have expired"
                VALIDATIONS[$check_name]="FAIL"
            fi
        else
            error "Missing SSL certificate files: ${missing_files[*]}"
            VALIDATIONS[$check_name]="FAIL"
        fi
    else
        warn "SSL certificates not found - need to run SSL setup"
        VALIDATIONS[$check_name]="WARN"
    fi
    
    # Check auto-renewal setup
    if crontab -l 2>/dev/null | grep -q "certbot\|ssl-renew"; then
        log "SSL auto-renewal is configured"
    else
        warn "SSL auto-renewal not configured"
    fi
}

# Validate system resources
validate_system() {
    local check_name="system"
    info "Validating system resources..."
    
    # Check available memory (minimum 2GB recommended)
    local total_memory=$(free -m | grep "Mem:" | awk '{print $2}')
    if [[ $total_memory -lt 2048 ]]; then
        warn "Low system memory: ${total_memory}MB (recommended: 2048MB+)"
        VALIDATIONS[$check_name]="WARN"
    else
        log "Sufficient system memory: ${total_memory}MB"
    fi
    
    # Check available disk space (minimum 10GB recommended)
    local available_space=$(df / | tail -1 | awk '{print $4}')
    local available_space_gb=$((available_space / 1024 / 1024))
    if [[ $available_space_gb -lt 10 ]]; then
        warn "Low disk space: ${available_space_gb}GB (recommended: 10GB+)"
        VALIDATIONS[$check_name]="WARN"
    else
        log "Sufficient disk space: ${available_space_gb}GB available"
    fi
    
    # Check if required ports are available
    local required_ports=("80" "443" "3000")
    for port in "${required_ports[@]}"; do
        if ss -tln | grep -q ":${port} "; then
            warn "Port $port is already in use"
            VALIDATIONS[$check_name]="WARN"
        else
            log "Port $port is available"
        fi
    done
    
    if [[ "${VALIDATIONS[$check_name]:-}" != "WARN" ]]; then
        VALIDATIONS[$check_name]="PASS"
    fi
}

# Validate firewall configuration
validate_firewall() {
    local check_name="firewall"
    info "Validating firewall configuration..."
    
    # Check if ufw is active
    if command -v ufw &> /dev/null; then
        local ufw_status=$(ufw status | head -1)
        if [[ "$ufw_status" == *"active"* ]]; then
            log "UFW firewall is active"
            
            # Check if required ports are allowed
            local required_ports=("22" "80" "443")
            for port in "${required_ports[@]}"; do
                if ufw status | grep -q "$port"; then
                    log "Port $port is allowed in firewall"
                else
                    warn "Port $port may not be allowed in firewall"
                fi
            done
            
            VALIDATIONS[$check_name]="PASS"
        else
            warn "UFW firewall is not active"
            VALIDATIONS[$check_name]="WARN"
        fi
    elif command -v iptables &> /dev/null; then
        warn "iptables detected - manual firewall configuration required"
        VALIDATIONS[$check_name]="WARN"
    else
        warn "No firewall detected - security risk"
        VALIDATIONS[$check_name]="WARN"
    fi
}

# Validate DNS configuration
validate_dns() {
    local check_name="dns"
    info "Validating DNS configuration..."
    
    local domain="primosphere.studio"
    
    # Check if domain resolves to current server
    local domain_ip=$(dig +short "$domain" 2>/dev/null || nslookup "$domain" 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}' || echo "")
    local server_ip=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "unknown")
    
    if [[ -n "$domain_ip" ]]; then
        if [[ "$domain_ip" == "$server_ip" ]]; then
            log "DNS configuration is correct: $domain -> $domain_ip"
            VALIDATIONS[$check_name]="PASS"
        else
            warn "DNS may not point to this server: $domain -> $domain_ip (server: $server_ip)"
            VALIDATIONS[$check_name]="WARN"
        fi
    else
        warn "Could not resolve domain: $domain"
        VALIDATIONS[$check_name]="WARN"
    fi
    
    # Check www subdomain
    local www_ip=$(dig +short "www.$domain" 2>/dev/null || echo "")
    if [[ -n "$www_ip" ]]; then
        log "www subdomain configured: www.$domain -> $www_ip"
    else
        warn "www subdomain not configured"
    fi
}

# Validate backup configuration
validate_backup() {
    local check_name="backup"
    info "Validating backup configuration..."
    
    local backup_script="${PROJECT_DIR}/scripts/backup-restore.sh"
    
    if [[ -x "$backup_script" ]]; then
        log "Backup script is present and executable"
        
        # Check if backup directory can be created
        local backup_dir="/opt/echotune/backups"
        if mkdir -p "$backup_dir" 2>/dev/null; then
            log "Backup directory is accessible: $backup_dir"
            VALIDATIONS[$check_name]="PASS"
        else
            warn "Cannot create backup directory: $backup_dir"
            VALIDATIONS[$check_name]="WARN"
        fi
        
        # Check for backup cron job
        if crontab -l 2>/dev/null | grep -q "backup"; then
            log "Backup cron job is configured"
        else
            warn "No backup cron job found"
        fi
    else
        warn "Backup script not found or not executable: $backup_script"
        VALIDATIONS[$check_name]="WARN"
    fi
}

# Validate monitoring setup
validate_monitoring() {
    local check_name="monitoring"
    info "Validating monitoring setup..."
    
    local health_script="${PROJECT_DIR}/scripts/health-check.sh"
    
    if [[ -x "$health_script" ]]; then
        log "Health check script is present and executable"
        VALIDATIONS[$check_name]="PASS"
        
        # Check for monitoring cron job
        if crontab -l 2>/dev/null | grep -q "health-check"; then
            log "Health check cron job is configured"
        else
            warn "No health check cron job found"
        fi
    else
        warn "Health check script not found or not executable: $health_script"
        VALIDATIONS[$check_name]="WARN"
    fi
    
    # Check log directory
    local log_dir="/var/log/echotune"
    if mkdir -p "$log_dir" 2>/dev/null; then
        log "Log directory is accessible: $log_dir"
    else
        warn "Cannot create log directory: $log_dir"
    fi
}

# Generate validation report
generate_report() {
    info "=== Production Deployment Validation Report ==="
    
    local failed_checks=()
    local warning_checks=()
    local passed_checks=()
    
    for check in "${!VALIDATIONS[@]}"; do
        case "${VALIDATIONS[$check]}" in
            "PASS")
                passed_checks+=("$check")
                ;;
            "WARN")
                warning_checks+=("$check")
                ;;
            "FAIL")
                failed_checks+=("$check")
                ;;
        esac
    done
    
    echo
    echo "Overall Status: $OVERALL_STATUS"
    echo "Timestamp: $(date)"
    echo "Hostname: $(hostname)"
    echo
    
    if [[ ${#passed_checks[@]} -gt 0 ]]; then
        echo "✓ Passed Validations (${#passed_checks[@]}):"
        printf '  - %s\n' "${passed_checks[@]}"
        echo
    fi
    
    if [[ ${#warning_checks[@]} -gt 0 ]]; then
        echo "⚠ Warnings (${#warning_checks[@]}):"
        printf '  - %s\n' "${warning_checks[@]}"
        echo
    fi
    
    if [[ ${#failed_checks[@]} -gt 0 ]]; then
        echo "✗ Failed Validations (${#failed_checks[@]}):"
        printf '  - %s\n' "${failed_checks[@]}"
        echo
        echo "Please fix the failed validations before deploying to production."
    fi
    
    if [[ "$OVERALL_STATUS" == "VALID" ]]; then
        log "✓ Deployment validation passed successfully!"
        echo "Your system is ready for production deployment."
    else
        error "✗ Deployment validation failed!"
        echo "Please address the failed validations before proceeding."
    fi
}

# Main execution
main() {
    info "Starting production deployment validation..."
    echo
    
    # Run all validations
    check_user
    validate_environment
    validate_docker
    validate_nginx
    validate_ssl
    validate_system
    validate_firewall
    validate_dns
    validate_backup
    validate_monitoring
    
    echo
    generate_report
    
    # Exit with appropriate code
    if [[ "$OVERALL_STATUS" == "VALID" ]]; then
        exit 0
    else
        exit 1
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Production Deployment Validation for EchoTune AI"
        echo "Usage: $0 [options]"
        echo
        echo "This script validates the production deployment configuration"
        echo "and system readiness for EchoTune AI."
        echo
        echo "The script checks:"
        echo "  - Environment configuration"
        echo "  - Docker and docker-compose setup"
        echo "  - Nginx configuration"
        echo "  - SSL certificate setup"
        echo "  - System resources"
        echo "  - Firewall configuration"
        echo "  - DNS configuration"
        echo "  - Backup and monitoring setup"
        ;;
    *)
        main
        ;;
esac