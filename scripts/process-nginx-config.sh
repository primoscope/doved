#!/bin/bash

# Environment Variable Substitution for Nginx Configuration
# Processes nginx.conf.template and creates nginx.conf with environment variables substituted

set -euo pipefail

# Set default values for nginx configuration
export DOMAIN="${DOMAIN:-localhost}"
export WWW_DOMAIN="${WWW_DOMAIN:-www.localhost}"
export APP_HOST="${APP_HOST:-app}"
export APP_PORT="${APP_PORT:-3000}"
export API_RATE_LIMIT="${API_RATE_LIMIT:-10r/s}"
export AUTH_RATE_LIMIT="${AUTH_RATE_LIMIT:-5r/m}"
export GENERAL_RATE_LIMIT="${GENERAL_RATE_LIMIT:-100r/m}"
export API_BURST="${API_BURST:-20}"
export AUTH_BURST="${AUTH_BURST:-5}"
export GENERAL_BURST="${GENERAL_BURST:-50}"
export SSL_CERT_PATH="${SSL_CERT_PATH:-/etc/nginx/ssl/cert.pem}"
export SSL_KEY_PATH="${SSL_KEY_PATH:-/etc/nginx/ssl/private.key}"
export ACCESS_LOG_PATH="${ACCESS_LOG_PATH:-/var/log/nginx/echotune_access.log}"
export ERROR_LOG_PATH="${ERROR_LOG_PATH:-/var/log/nginx/echotune_error.log}"

# Directory configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEMPLATE_FILE="$PROJECT_ROOT/nginx.conf.template"
OUTPUT_FILE="$PROJECT_ROOT/nginx.conf"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Check if template file exists
if [[ ! -f "$TEMPLATE_FILE" ]]; then
    log "ERROR: Template file not found: $TEMPLATE_FILE"
    exit 1
fi

# Check if envsubst is available
if ! command -v envsubst &> /dev/null; then
    log "ERROR: envsubst command not found. Please install gettext-base package."
    exit 1
fi

log "Processing nginx configuration template..."
log "Template: $TEMPLATE_FILE"
log "Output: $OUTPUT_FILE"

# List of environment variables to substitute
NGINX_VARS='$DOMAIN,$WWW_DOMAIN,$APP_HOST,$APP_PORT,$API_RATE_LIMIT,$AUTH_RATE_LIMIT,$GENERAL_RATE_LIMIT,$API_BURST,$AUTH_BURST,$GENERAL_BURST,$SSL_CERT_PATH,$SSL_KEY_PATH,$ACCESS_LOG_PATH,$ERROR_LOG_PATH'

# Process the template with environment variable substitution
envsubst "$NGINX_VARS" < "$TEMPLATE_FILE" > "$OUTPUT_FILE"

if [[ $? -eq 0 ]]; then
    log "✅ Nginx configuration generated successfully"
    log "Configuration written to: $OUTPUT_FILE"
    
    # Display current environment values
    if [[ "${VERBOSE:-false}" == "true" ]]; then
        log "Environment variables used:"
        echo "  DOMAIN=$DOMAIN"
        echo "  WWW_DOMAIN=$WWW_DOMAIN"
        echo "  APP_HOST=$APP_HOST"
        echo "  APP_PORT=$APP_PORT"
        echo "  API_RATE_LIMIT=$API_RATE_LIMIT"
        echo "  AUTH_RATE_LIMIT=$AUTH_RATE_LIMIT"
        echo "  GENERAL_RATE_LIMIT=$GENERAL_RATE_LIMIT"
        echo "  API_BURST=$API_BURST"
        echo "  AUTH_BURST=$AUTH_BURST"
        echo "  GENERAL_BURST=$GENERAL_BURST"
        echo "  SSL_CERT_PATH=$SSL_CERT_PATH"
        echo "  SSL_KEY_PATH=$SSL_KEY_PATH"
        echo "  ACCESS_LOG_PATH=$ACCESS_LOG_PATH"
        echo "  ERROR_LOG_PATH=$ERROR_LOG_PATH"
    fi
else
    log "❌ Failed to process nginx configuration template"
    exit 1
fi

# Validate nginx configuration if nginx is available
if command -v nginx &> /dev/null; then
    log "Validating nginx configuration..."
    if nginx -t -c "$OUTPUT_FILE" &> /dev/null; then
        log "✅ Nginx configuration is valid"
    else
        log "❌ Nginx configuration validation failed"
        nginx -t -c "$OUTPUT_FILE" 2>&1 | head -10
        exit 1
    fi
else
    log "ℹ️  nginx command not available for validation"
fi

log "Nginx configuration processing completed successfully"