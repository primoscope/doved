#!/bin/bash

# SSL Certificate Setup Script for EchoTune AI Production
# This script sets up Let's Encrypt SSL certificates using Certbot

set -euo pipefail

# Configuration
DOMAIN="primosphere.studio"
EMAIL="admin@primosphere.studio"
WEBROOT="/var/www/certbot"
NGINX_CONF="/etc/nginx/nginx.conf"
COMPOSE_FILE="/opt/echotune/docker-compose.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root for security reasons"
        exit 1
    fi
}

# Check if domain is accessible
check_domain() {
    log "Checking domain accessibility..."
    if ! curl -s --max-time 10 "http://${DOMAIN}/.well-known/acme-challenge/test" > /dev/null 2>&1; then
        warn "Domain ${DOMAIN} may not be properly configured"
        warn "Make sure your DNS is pointing to this server"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Install Certbot if not present
install_certbot() {
    if ! command -v certbot &> /dev/null; then
        log "Installing Certbot..."
        
        # Detect OS and install accordingly
        if [[ -f /etc/debian_version ]]; then
            sudo apt-get update
            sudo apt-get install -y certbot python3-certbot-nginx
        elif [[ -f /etc/redhat-release ]]; then
            sudo yum install -y certbot python3-certbot-nginx
        else
            error "Unsupported operating system. Please install Certbot manually."
            exit 1
        fi
    else
        log "Certbot is already installed"
    fi
}

# Create webroot directory
setup_webroot() {
    log "Setting up webroot directory..."
    sudo mkdir -p "${WEBROOT}"
    sudo chown -R www-data:www-data "${WEBROOT}" 2>/dev/null || sudo chown -R nginx:nginx "${WEBROOT}"
    sudo chmod 755 "${WEBROOT}"
}

# Test Certbot challenge
test_challenge() {
    log "Testing Certbot challenge..."
    
    # Create test file
    echo "certbot-test" | sudo tee "${WEBROOT}/test" > /dev/null
    
    # Test if accessible
    if curl -s "http://${DOMAIN}/.well-known/acme-challenge/test" | grep -q "certbot-test"; then
        log "Certbot challenge test successful"
        sudo rm -f "${WEBROOT}/test"
    else
        error "Certbot challenge test failed. Check your nginx configuration."
        exit 1
    fi
}

# Generate SSL certificate
generate_certificate() {
    log "Generating SSL certificate for ${DOMAIN}..."
    
    # Dry run first
    log "Running dry-run to test certificate generation..."
    if sudo certbot certonly \
        --webroot \
        --webroot-path="${WEBROOT}" \
        --email "${EMAIL}" \
        --agree-tos \
        --no-eff-email \
        --dry-run \
        -d "${DOMAIN}" \
        -d "www.${DOMAIN}"; then
        log "Dry-run successful"
    else
        error "Dry-run failed. Please check your configuration."
        exit 1
    fi
    
    # Generate actual certificate
    log "Generating actual certificate..."
    if sudo certbot certonly \
        --webroot \
        --webroot-path="${WEBROOT}" \
        --email "${EMAIL}" \
        --agree-tos \
        --no-eff-email \
        -d "${DOMAIN}" \
        -d "www.${DOMAIN}"; then
        log "Certificate generated successfully"
    else
        error "Certificate generation failed"
        exit 1
    fi
}

# Set up auto-renewal
setup_auto_renewal() {
    log "Setting up automatic certificate renewal..."
    
    # Create renewal script
    cat > /tmp/ssl-renew.sh << 'EOF'
#!/bin/bash

# Certificate renewal script
LOGFILE="/var/log/letsencrypt-renewal.log"

{
    echo "=== Certificate Renewal - $(date) ==="
    
    # Attempt renewal
    if certbot renew --quiet --no-self-upgrade; then
        echo "Certificate renewal successful"
        
        # Reload nginx
        if systemctl is-active --quiet nginx; then
            systemctl reload nginx
            echo "Nginx reloaded"
        elif command -v docker-compose &> /dev/null; then
            cd /opt/echotune && docker-compose restart nginx
            echo "Nginx container restarted"
        fi
    else
        echo "Certificate renewal failed"
        # Send alert (implement based on your notification system)
        echo "Certificate renewal failed on $(hostname)" | mail -s "SSL Certificate Renewal Failed" admin@primosphere.studio 2>/dev/null || true
    fi
    
    echo "=== End of renewal - $(date) ==="
    echo
} >> "$LOGFILE" 2>&1
EOF

    sudo mv /tmp/ssl-renew.sh /usr/local/bin/ssl-renew.sh
    sudo chmod +x /usr/local/bin/ssl-renew.sh
    
    # Add to crontab (twice daily renewal check)
    CRON_JOB="0 2,14 * * * /usr/local/bin/ssl-renew.sh"
    
    if ! sudo crontab -l 2>/dev/null | grep -q "ssl-renew.sh"; then
        (sudo crontab -l 2>/dev/null || true; echo "$CRON_JOB") | sudo crontab -
        log "Auto-renewal cron job added"
    else
        log "Auto-renewal cron job already exists"
    fi
    
    # Create logrotate configuration
    cat > /tmp/letsencrypt-renewal << 'EOF'
/var/log/letsencrypt-renewal.log {
    daily
    missingok
    rotate 52
    compress
    notifempty
    create 644 root root
}
EOF

    sudo mv /tmp/letsencrypt-renewal /etc/logrotate.d/letsencrypt-renewal
    log "Logrotate configuration created"
}

# Verify certificate
verify_certificate() {
    log "Verifying SSL certificate..."
    
    # Check certificate files exist
    if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]] && \
       [[ -f "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]]; then
        log "Certificate files found"
        
        # Check certificate validity
        if openssl x509 -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" -text -noout | grep -q "${DOMAIN}"; then
            log "Certificate is valid for ${DOMAIN}"
            
            # Show certificate info
            echo "Certificate information:"
            openssl x509 -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" -text -noout | grep -E "(Subject:|Not Before:|Not After:)"
        else
            error "Certificate validation failed"
            exit 1
        fi
    else
        error "Certificate files not found"
        exit 1
    fi
}

# Test SSL connection
test_ssl() {
    log "Testing SSL connection..."
    
    # Wait for nginx restart
    sleep 5
    
    if curl -s --max-time 10 "https://${DOMAIN}/health" > /dev/null 2>&1; then
        log "SSL connection test successful"
    else
        warn "SSL connection test failed. Make sure nginx is properly configured and running."
    fi
}

# Main execution
main() {
    log "Starting SSL certificate setup for ${DOMAIN}"
    
    check_root
    check_domain
    install_certbot
    setup_webroot
    test_challenge
    generate_certificate
    setup_auto_renewal
    verify_certificate
    
    log "SSL certificate setup completed successfully!"
    log "Certificate will auto-renew twice daily via cron job"
    log "Renewal logs can be found at: /var/log/letsencrypt-renewal.log"
    
    # Restart nginx to use new certificates
    warn "Please restart nginx to use the new certificates:"
    echo "  sudo systemctl restart nginx"
    echo "  OR"
    echo "  cd /opt/echotune && docker-compose restart nginx"
    
    test_ssl
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi