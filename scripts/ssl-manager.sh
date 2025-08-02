#!/bin/bash

# SSL Certificate Manager for EchoTune AI
# Handles SSL certificate generation, renewal, and management with Certbot

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SSL_DIR="${SSL_DIR:-/etc/nginx/ssl}"
CERTBOT_DIR="${CERTBOT_DIR:-/etc/letsencrypt}"
WEBROOT_DIR="${WEBROOT_DIR:-/var/www/certbot}"
LOG_FILE="${LOG_FILE:-/var/log/ssl-manager.log}"

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
fi

# Default values
DOMAIN="${DOMAIN:-localhost}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"
STAGING="${STAGING:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Logging function
log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR" "$1"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root for SSL certificate management"
    fi
}

# Install Certbot if not present
install_certbot() {
    if ! command -v certbot &> /dev/null; then
        log "INFO" "Installing Certbot..."
        
        if command -v apt-get &> /dev/null; then
            apt-get update
            apt-get install -y certbot python3-certbot-nginx
        elif command -v yum &> /dev/null; then
            yum install -y certbot python3-certbot-nginx
        else
            error_exit "Unsupported package manager. Please install Certbot manually."
        fi
        
        log "INFO" "Certbot installed successfully"
    else
        log "INFO" "Certbot is already installed"
    fi
}

# Create necessary directories
create_directories() {
    log "INFO" "Creating SSL directories..."
    
    mkdir -p "$SSL_DIR"
    mkdir -p "$WEBROOT_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Set proper permissions
    chmod 755 "$SSL_DIR"
    chmod 755 "$WEBROOT_DIR"
    
    log "INFO" "Directories created successfully"
}

# Generate self-signed certificate for testing
generate_self_signed() {
    local domain="$1"
    local cert_path="$SSL_DIR/${domain}.crt"
    local key_path="$SSL_DIR/${domain}.key"
    
    log "INFO" "Generating self-signed certificate for $domain"
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$key_path" \
        -out "$cert_path" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=$domain"
    
    chmod 600 "$key_path"
    chmod 644 "$cert_path"
    
    log "INFO" "Self-signed certificate generated: $cert_path"
}

# Check if certificate exists and is valid
check_certificate() {
    local domain="$1"
    local cert_path="$CERTBOT_DIR/live/$domain/fullchain.pem"
    
    if [[ -f "$cert_path" ]]; then
        local expiry_date
        expiry_date=$(openssl x509 -enddate -noout -in "$cert_path" | cut -d= -f2)
        local expiry_epoch
        expiry_epoch=$(date -d "$expiry_date" +%s)
        local current_epoch
        current_epoch=$(date +%s)
        local days_remaining
        days_remaining=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        log "INFO" "Certificate for $domain expires in $days_remaining days"
        
        if [[ $days_remaining -lt 30 ]]; then
            log "WARN" "Certificate for $domain expires soon"
            return 1
        else
            log "INFO" "Certificate for $domain is valid"
            return 0
        fi
    else
        log "INFO" "No certificate found for $domain"
        return 1
    fi
}

# Obtain SSL certificate with Certbot
obtain_certificate() {
    local domain="$1"
    local email="$2"
    local staging="$3"
    local dry_run="$4"
    
    local certbot_args=(
        "certonly"
        "--webroot"
        "--webroot-path=$WEBROOT_DIR"
        "--email=$email"
        "--agree-tos"
        "--no-eff-email"
        "--domains=$domain"
        "--non-interactive"
    )
    
    if [[ "$staging" == "true" ]]; then
        certbot_args+=("--staging")
        log "INFO" "Using Let's Encrypt staging environment"
    fi
    
    if [[ "$dry_run" == "true" ]]; then
        certbot_args+=("--dry-run")
        log "INFO" "Performing dry run"
    fi
    
    log "INFO" "Obtaining SSL certificate for $domain"
    
    if certbot "${certbot_args[@]}"; then
        log "INFO" "Certificate obtained successfully for $domain"
        
        if [[ "$dry_run" != "true" ]]; then
            # Create symlinks in SSL directory
            ln -sf "$CERTBOT_DIR/live/$domain/fullchain.pem" "$SSL_DIR/${domain}.crt"
            ln -sf "$CERTBOT_DIR/live/$domain/privkey.pem" "$SSL_DIR/${domain}.key"
            
            log "INFO" "Certificate symlinks created in $SSL_DIR"
        fi
        
        return 0
    else
        log "ERROR" "Failed to obtain certificate for $domain"
        return 1
    fi
}

# Renew certificates
renew_certificates() {
    local dry_run="$1"
    
    log "INFO" "Renewing SSL certificates"
    
    local certbot_args=("renew" "--non-interactive")
    
    if [[ "$dry_run" == "true" ]]; then
        certbot_args+=("--dry-run")
        log "INFO" "Performing dry run renewal"
    fi
    
    if certbot "${certbot_args[@]}"; then
        log "INFO" "Certificate renewal completed successfully"
        
        if [[ "$dry_run" != "true" ]]; then
            # Reload nginx to use new certificates
            if systemctl is-active --quiet nginx; then
                systemctl reload nginx
                log "INFO" "Nginx reloaded with new certificates"
            fi
        fi
        
        return 0
    else
        log "ERROR" "Certificate renewal failed"
        return 1
    fi
}

# Setup automatic renewal
setup_auto_renewal() {
    log "INFO" "Setting up automatic certificate renewal"
    
    # Create renewal script
    cat > /etc/cron.d/certbot-renewal << EOF
# Certbot automatic renewal for EchoTune AI
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Renew certificates twice daily
0 */12 * * * root certbot renew --quiet && systemctl reload nginx
EOF
    
    chmod 644 /etc/cron.d/certbot-renewal
    
    log "INFO" "Automatic renewal configured"
}

# Test certificate configuration
test_certificate() {
    local domain="$1"
    
    log "INFO" "Testing SSL certificate for $domain"
    
    if command -v openssl &> /dev/null; then
        if echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates; then
            log "INFO" "SSL certificate test passed for $domain"
            return 0
        else
            log "ERROR" "SSL certificate test failed for $domain"
            return 1
        fi
    else
        log "WARN" "OpenSSL not available for testing"
        return 0
    fi
}

# Display certificate information
show_certificate_info() {
    local domain="$1"
    local cert_path="$CERTBOT_DIR/live/$domain/fullchain.pem"
    
    if [[ -f "$cert_path" ]]; then
        log "INFO" "Certificate information for $domain:"
        openssl x509 -text -noout -in "$cert_path" | grep -E "(Subject:|Issuer:|Not Before:|Not After:)"
    else
        log "WARN" "No certificate found for $domain"
    fi
}

# Main functions
generate_certs() {
    local domain="${1:-$DOMAIN}"
    local email="${2:-$EMAIL}"
    
    log "INFO" "Starting certificate generation for $domain"
    
    check_root
    install_certbot
    create_directories
    
    if [[ "$domain" == "localhost" ]] || [[ "$domain" == *.local ]]; then
        log "INFO" "Generating self-signed certificate for local development"
        generate_self_signed "$domain"
    else
        if ! check_certificate "$domain"; then
            if obtain_certificate "$domain" "$email" "$STAGING" "$DRY_RUN"; then
                setup_auto_renewal
                show_certificate_info "$domain"
            else
                log "WARN" "Let's Encrypt failed, falling back to self-signed certificate"
                generate_self_signed "$domain"
            fi
        else
            log "INFO" "Valid certificate already exists for $domain"
        fi
    fi
    
    log "INFO" "Certificate generation completed"
}

renew_certs() {
    log "INFO" "Starting certificate renewal"
    
    check_root
    
    if renew_certificates "$DRY_RUN"; then
        log "INFO" "Certificate renewal completed successfully"
    else
        error_exit "Certificate renewal failed"
    fi
}

test_certs() {
    local domain="${1:-$DOMAIN}"
    
    log "INFO" "Testing certificates for $domain"
    
    if test_certificate "$domain"; then
        log "INFO" "Certificate test passed"
    else
        error_exit "Certificate test failed"
    fi
}

status_certs() {
    local domain="${1:-$DOMAIN}"
    
    log "INFO" "Certificate status for $domain"
    
    show_certificate_info "$domain"
    check_certificate "$domain"
}

# Help function
show_help() {
    cat << EOF
SSL Certificate Manager for EchoTune AI

Usage: $0 <command> [options]

Commands:
    generate [domain] [email]   Generate SSL certificates
    renew                       Renew existing certificates
    test [domain]              Test certificate configuration
    status [domain]            Show certificate status
    help                       Show this help message

Environment Variables:
    DOMAIN                     Domain name (default: localhost)
    LETSENCRYPT_EMAIL         Email for Let's Encrypt (default: admin@domain)
    STAGING                   Use staging environment (default: false)
    DRY_RUN                   Perform dry run (default: false)
    SSL_DIR                   SSL directory (default: /etc/nginx/ssl)

Examples:
    $0 generate example.com admin@example.com
    $0 renew
    STAGING=true $0 generate example.com admin@example.com
    DRY_RUN=true $0 renew

EOF
}

# Main script execution
main() {
    case "${1:-help}" in
        "generate")
            generate_certs "${2:-}" "${3:-}"
            ;;
        "renew")
            renew_certs
            ;;
        "test")
            test_certs "${2:-}"
            ;;
        "status")
            status_certs "${2:-}"
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log "ERROR" "Unknown command: ${1:-}"
            show_help
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"