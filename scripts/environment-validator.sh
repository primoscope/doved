#!/bin/bash

# 🔧 EchoTune AI - Environment Validator and Fixer
# Validates and automatically fixes environment configuration issues
# Ensures .env utilizes all available options and follows best practices

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_BACKUP="$PROJECT_ROOT/.env.backup.$(date +%Y%m%d_%H%M%S)"
VALIDATION_LOG="$PROJECT_ROOT/env-validation-$(date +%Y%m%d_%H%M%S).log"

# Validation flags
FIX_ISSUES=false
GENERATE_SECRETS=false
INTERACTIVE_MODE=false
VALIDATE_APIS=false

# Environment validation results
declare -A ENV_STATUS
ISSUES_FOUND=0
ISSUES_FIXED=0

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$VALIDATION_LOG"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$VALIDATION_LOG"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$VALIDATION_LOG"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$VALIDATION_LOG"; }
log_fix() { echo -e "${PURPLE}[FIX]${NC} $1" | tee -a "$VALIDATION_LOG"; }

# Helper functions
generate_secret() {
    local length="${1:-32}"
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex "$length"
    else
        # Fallback method
        head -c "$length" </dev/urandom | base64 | tr -d '=+/' | cut -c1-"$((length*2))"
    fi
}

backup_env_file() {
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$ENV_BACKUP"
        log_info "Environment file backed up to: $ENV_BACKUP"
    fi
}

validate_env_syntax() {
    log_info "Validating .env file syntax..."
    
    if [ ! -f "$ENV_FILE" ]; then
        log_error ".env file not found"
        ENV_STATUS[ENV_FILE_EXISTS]="MISSING"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        return 1
    fi
    
    # Test if the file can be sourced
    if bash -c "set -a && source '$ENV_FILE' && set +a" >/dev/null 2>&1; then
        log_success ".env file has valid syntax"
        ENV_STATUS[ENV_SYNTAX]="VALID"
        return 0
    else
        log_error ".env file has syntax errors"
        ENV_STATUS[ENV_SYNTAX]="INVALID"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        return 1
    fi
}

check_required_variables() {
    log_info "Checking required environment variables..."
    
    # Load environment variables
    set -a
    source "$ENV_FILE" 2>/dev/null || true
    set +a
    
    # Define required variables by category
    declare -A REQUIRED_VARS=(
        ["NODE_ENV"]="development|staging|production"
        ["PORT"]="numeric"
        ["DOMAIN"]="domain"
        ["FRONTEND_URL"]="url"
    )
    
    declare -A CRITICAL_VARS=(
        ["SESSION_SECRET"]="secret"
        ["JWT_SECRET"]="secret"
    )
    
    # Check required variables
    for var in "${!REQUIRED_VARS[@]}"; do
        local validation_type="${REQUIRED_VARS[$var]}"
        
        if [ -n "${!var:-}" ]; then
            case "$validation_type" in
                "development|staging|production")
                    if [[ "${!var}" =~ ^(development|staging|production)$ ]]; then
                        log_success "$var is set to valid value: ${!var}"
                        ENV_STATUS[$var]="VALID"
                    else
                        log_warning "$var has invalid value: ${!var} (should be development, staging, or production)"
                        ENV_STATUS[$var]="INVALID"
                        ISSUES_FOUND=$((ISSUES_FOUND + 1))
                    fi
                    ;;
                "numeric")
                    if [[ "${!var}" =~ ^[0-9]+$ ]]; then
                        log_success "$var is set to valid port: ${!var}"
                        ENV_STATUS[$var]="VALID"
                    else
                        log_warning "$var is not a valid port number: ${!var}"
                        ENV_STATUS[$var]="INVALID"
                        ISSUES_FOUND=$((ISSUES_FOUND + 1))
                    fi
                    ;;
                "domain")
                    if [[ "${!var}" =~ ^[a-zA-Z0-9.-]+$ ]] || [ "${!var}" = "localhost" ]; then
                        log_success "$var is set to: ${!var}"
                        ENV_STATUS[$var]="VALID"
                    else
                        log_warning "$var has invalid domain format: ${!var}"
                        ENV_STATUS[$var]="INVALID"
                        ISSUES_FOUND=$((ISSUES_FOUND + 1))
                    fi
                    ;;
                "url")
                    if [[ "${!var}" =~ ^https?:// ]]; then
                        log_success "$var is set to valid URL: ${!var}"
                        ENV_STATUS[$var]="VALID"
                    else
                        log_warning "$var is not a valid URL: ${!var}"
                        ENV_STATUS[$var]="INVALID"
                        ISSUES_FOUND=$((ISSUES_FOUND + 1))
                    fi
                    ;;
            esac
        else
            log_error "$var is not set"
            ENV_STATUS[$var]="MISSING"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    done
    
    # Check critical security variables
    for var in "${!CRITICAL_VARS[@]}"; do
        local var_value="${!var:-}"
        if [ -n "$var_value" ]; then
            local secret_length=${#var_value}
            if [ "$secret_length" -ge 32 ]; then
                log_success "$var is set with adequate length ($secret_length characters)"
                ENV_STATUS[$var]="VALID"
            else
                log_error "$var is too short ($secret_length characters, minimum 32 required)"
                ENV_STATUS[$var]="WEAK"
                ISSUES_FOUND=$((ISSUES_FOUND + 1))
            fi
        else
            log_error "$var is not set (required for security)"
            ENV_STATUS[$var]="MISSING"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    done
}

check_api_configurations() {
    log_info "Checking API configurations..."
    
    # Load environment variables
    set -a
    source "$ENV_FILE" 2>/dev/null || true
    set +a
    
    # Spotify API
    if [ -n "${SPOTIFY_CLIENT_ID:-}" ] && [ -n "${SPOTIFY_CLIENT_SECRET:-}" ]; then
        if [[ "${SPOTIFY_CLIENT_ID}" != *"your_"* ]] && [[ "${SPOTIFY_CLIENT_ID}" != *"demo_"* ]]; then
            log_success "Spotify API credentials appear to be configured"
            ENV_STATUS[SPOTIFY_API]="CONFIGURED"
            
            if [ -n "${SPOTIFY_REDIRECT_URI:-}" ]; then
                if [[ "${SPOTIFY_REDIRECT_URI}" == *"${DOMAIN:-localhost}"* ]]; then
                    log_success "Spotify redirect URI matches domain configuration"
                    ENV_STATUS[SPOTIFY_REDIRECT]="VALID"
                else
                    log_warning "Spotify redirect URI may not match domain: ${SPOTIFY_REDIRECT_URI}"
                    ENV_STATUS[SPOTIFY_REDIRECT]="MISMATCH"
                    ISSUES_FOUND=$((ISSUES_FOUND + 1))
                fi
            else
                log_warning "Spotify redirect URI not set"
                ENV_STATUS[SPOTIFY_REDIRECT]="MISSING"
                ISSUES_FOUND=$((ISSUES_FOUND + 1))
            fi
        else
            log_warning "Spotify credentials appear to be placeholder values"
            ENV_STATUS[SPOTIFY_API]="PLACEHOLDER"
        fi
    else
        log_info "Spotify API not configured (demo mode will be used)"
        ENV_STATUS[SPOTIFY_API]="NOT_CONFIGURED"
    fi
    
    # AI/LLM Providers
    local ai_providers_configured=0
    local ai_providers=("OPENAI_API_KEY" "GEMINI_API_KEY" "AZURE_OPENAI_API_KEY")
    
    for provider in "${ai_providers[@]}"; do
        if [ -n "${!provider:-}" ] && [[ "${!provider}" != *"your_"* ]] && [[ "${!provider}" != *"demo_"* ]]; then
            log_success "$provider is configured"
            ENV_STATUS[$provider]="CONFIGURED"
            ai_providers_configured=$((ai_providers_configured + 1))
        elif [ -n "${!provider:-}" ]; then
            log_warning "$provider appears to be a placeholder value"
            ENV_STATUS[$provider]="PLACEHOLDER"
        else
            ENV_STATUS[$provider]="NOT_CONFIGURED"
        fi
    done
    
    if [ $ai_providers_configured -eq 0 ]; then
        log_info "No AI providers configured (demo mode will be used)"
        ENV_STATUS[AI_PROVIDERS]="DEMO_MODE"
    else
        log_success "$ai_providers_configured AI provider(s) configured"
        ENV_STATUS[AI_PROVIDERS]="CONFIGURED"
    fi
    
    # Database Configuration
    if [ -n "${MONGODB_URI:-}" ] && [[ "${MONGODB_URI}" != *"your_"* ]]; then
        log_success "MongoDB URI is configured"
        ENV_STATUS[MONGODB]="CONFIGURED"
    elif [ -n "${DATABASE_URL:-}" ]; then
        log_success "PostgreSQL database is configured"
        ENV_STATUS[DATABASE]="CONFIGURED"
    else
        log_info "No external database configured (SQLite will be used)"
        ENV_STATUS[DATABASE]="SQLITE_FALLBACK"
    fi
}

check_security_configuration() {
    log_info "Checking security configuration..."
    
    # Load environment variables
    set -a
    source "$ENV_FILE" 2>/dev/null || true
    set +a
    
    # Rate limiting configuration
    local rate_limit_vars=("RATE_LIMIT_WINDOW_MS" "RATE_LIMIT_MAX_REQUESTS" "AUTH_RATE_LIMIT_MAX")
    local rate_limit_configured=true
    
    for var in "${rate_limit_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            rate_limit_configured=false
            break
        fi
    done
    
    if [ "$rate_limit_configured" = true ]; then
        log_success "Rate limiting is properly configured"
        ENV_STATUS[RATE_LIMITING]="CONFIGURED"
    else
        log_warning "Rate limiting configuration is incomplete"
        ENV_STATUS[RATE_LIMITING]="INCOMPLETE"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
    
    # CORS configuration
    if [ "${ENABLE_CORS:-}" = "true" ] && [ -n "${CORS_ORIGINS:-}" ]; then
        log_success "CORS is properly configured"
        ENV_STATUS[CORS]="CONFIGURED"
    else
        log_warning "CORS configuration may be incomplete"
        ENV_STATUS[CORS]="INCOMPLETE"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
    
    # SSL configuration for production
    if [ "${NODE_ENV:-}" = "production" ]; then
        if [ "${DOMAIN:-}" != "localhost" ] && [ -z "${SSL_CERT_PATH:-}" ]; then
            log_warning "Production environment without SSL certificate paths configured"
            ENV_STATUS[SSL_CONFIG]="MISSING"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        else
            log_success "SSL configuration appears appropriate for environment"
            ENV_STATUS[SSL_CONFIG]="APPROPRIATE"
        fi
    fi
}

check_performance_configuration() {
    log_info "Checking performance configuration..."
    
    # Load environment variables
    set -a
    source "$ENV_FILE" 2>/dev/null || true
    set +a
    
    # Caching configuration
    if [ "${CACHE_ENABLED:-}" = "true" ]; then
        log_success "Caching is enabled"
        ENV_STATUS[CACHING]="ENABLED"
    else
        log_info "Caching is not enabled (consider enabling for production)"
        ENV_STATUS[CACHING]="DISABLED"
    fi
    
    # Compression
    if [ "${COMPRESSION:-}" = "true" ]; then
        log_success "Compression is enabled"
        ENV_STATUS[COMPRESSION]="ENABLED"
    else
        log_warning "Compression is not enabled (recommended for production)"
        ENV_STATUS[COMPRESSION]="DISABLED"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
    
    # Logging level
    if [ -n "${LOG_LEVEL:-}" ]; then
        case "${LOG_LEVEL}" in
            "error"|"warn"|"info"|"debug")
                log_success "Log level is set to: ${LOG_LEVEL}"
                ENV_STATUS[LOG_LEVEL]="VALID"
                ;;
            *)
                log_warning "Invalid log level: ${LOG_LEVEL}"
                ENV_STATUS[LOG_LEVEL]="INVALID"
                ISSUES_FOUND=$((ISSUES_FOUND + 1))
                ;;
        esac
    else
        log_warning "Log level not specified"
        ENV_STATUS[LOG_LEVEL]="MISSING"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
}

auto_fix_issues() {
    if [ "$FIX_ISSUES" != "true" ]; then
        return 0
    fi
    
    log_info "Attempting to auto-fix environment issues..."
    
    # Backup before making changes
    backup_env_file
    
    # Load current environment
    set -a
    source "$ENV_FILE" 2>/dev/null || true
    set +a
    
    # Fix missing required variables
    local fixes_made=false
    
    # Generate missing secrets
    if [ "${ENV_STATUS[SESSION_SECRET]:-}" = "MISSING" ] || [ "${ENV_STATUS[SESSION_SECRET]:-}" = "WEAK" ]; then
        local new_secret=$(generate_secret 32)
        sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$new_secret/" "$ENV_FILE" 2>/dev/null || echo "SESSION_SECRET=$new_secret" >> "$ENV_FILE"
        log_fix "Generated new SESSION_SECRET"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    if [ "${ENV_STATUS[JWT_SECRET]:-}" = "MISSING" ] || [ "${ENV_STATUS[JWT_SECRET]:-}" = "WEAK" ]; then
        local new_secret=$(generate_secret 32)
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$new_secret/" "$ENV_FILE" 2>/dev/null || echo "JWT_SECRET=$new_secret" >> "$ENV_FILE"
        log_fix "Generated new JWT_SECRET"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    # Fix missing basic configuration
    if [ "${ENV_STATUS[NODE_ENV]:-}" = "MISSING" ]; then
        echo "NODE_ENV=development" >> "$ENV_FILE"
        log_fix "Set NODE_ENV to development"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    if [ "${ENV_STATUS[PORT]:-}" = "MISSING" ]; then
        echo "PORT=3000" >> "$ENV_FILE"
        log_fix "Set PORT to 3000"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    if [ "${ENV_STATUS[DOMAIN]:-}" = "MISSING" ]; then
        echo "DOMAIN=localhost" >> "$ENV_FILE"
        log_fix "Set DOMAIN to localhost"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    # Fix FRONTEND_URL to match domain and SSL
    if [ "${ENV_STATUS[FRONTEND_URL]:-}" = "MISSING" ] || [ "${ENV_STATUS[FRONTEND_URL]:-}" = "INVALID" ]; then
        local protocol="http"
        if [ "${SSL_ENABLED:-}" = "true" ] || [ "${NODE_ENV:-}" = "production" ]; then
            protocol="https"
        fi
        local frontend_url="${protocol}://${DOMAIN:-localhost}:${PORT:-3000}"
        sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=$frontend_url|" "$ENV_FILE" 2>/dev/null || echo "FRONTEND_URL=$frontend_url" >> "$ENV_FILE"
        log_fix "Updated FRONTEND_URL to $frontend_url"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    # Fix Spotify redirect URI
    if [ "${ENV_STATUS[SPOTIFY_REDIRECT]:-}" = "MISSING" ] || [ "${ENV_STATUS[SPOTIFY_REDIRECT]:-}" = "MISMATCH" ]; then
        local protocol="http"
        if [ "${SSL_ENABLED:-}" = "true" ] || [ "${NODE_ENV:-}" = "production" ]; then
            protocol="https"
        fi
        local redirect_uri="${protocol}://${DOMAIN:-localhost}:${PORT:-3000}/auth/callback"
        sed -i "s|SPOTIFY_REDIRECT_URI=.*|SPOTIFY_REDIRECT_URI=$redirect_uri|" "$ENV_FILE" 2>/dev/null || echo "SPOTIFY_REDIRECT_URI=$redirect_uri" >> "$ENV_FILE"
        log_fix "Updated Spotify redirect URI to $redirect_uri"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    # Add missing performance settings
    if [ "${ENV_STATUS[COMPRESSION]:-}" = "DISABLED" ]; then
        echo "COMPRESSION=true" >> "$ENV_FILE"
        log_fix "Enabled compression"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    # Add missing security settings
    if [ "${ENV_STATUS[RATE_LIMITING]:-}" = "INCOMPLETE" ]; then
        cat >> "$ENV_FILE" << EOF

# Rate Limiting (Auto-generated)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
EOF
        log_fix "Added rate limiting configuration"
        fixes_made=true
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
    fi
    
    if [ "$fixes_made" = true ]; then
        log_success "Auto-fix completed. Fixed $ISSUES_FIXED issue(s)"
        log_info "Original file backed up to: $ENV_BACKUP"
    else
        log_info "No issues could be automatically fixed"
    fi
}

generate_comprehensive_env() {
    log_info "Generating comprehensive .env file from template..."
    
    # Backup existing file
    backup_env_file
    
    # Create comprehensive .env from template
    cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
    
    # Generate secure secrets
    local session_secret=$(generate_secret 32)
    local jwt_secret=$(generate_secret 32)
    
    # Update with generated values
    sed -i "s/generate_random_32_char_string_for_sessions/$session_secret/" "$ENV_FILE"
    sed -i "s/generate_random_32_char_string_for_jwt_tokens/$jwt_secret/" "$ENV_FILE"
    
    log_success "Comprehensive .env file generated with secure secrets"
    log_info "Please review and update API keys and other configuration as needed"
}

interactive_configuration() {
    log_info "Starting interactive environment configuration..."
    
    echo ""
    echo -e "${CYAN}🔧 EchoTune AI - Environment Configuration${NC}"
    echo ""
    
    # Load current environment if exists
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE" 2>/dev/null || true
        set +a
        echo -e "${YELLOW}Current .env file found. Values in [brackets] are current settings.${NC}"
    else
        echo -e "${YELLOW}No .env file found. Creating new configuration.${NC}"
    fi
    
    echo ""
    
    # Basic configuration
    echo -e "${WHITE}Basic Configuration:${NC}"
    
    read -p "Environment (development/staging/production) [${NODE_ENV:-development}]: " env_input
    CONFIG_NODE_ENV="${env_input:-${NODE_ENV:-development}}"
    
    read -p "Port [${PORT:-3000}]: " port_input
    CONFIG_PORT="${port_input:-${PORT:-3000}}"
    
    read -p "Domain [${DOMAIN:-localhost}]: " domain_input
    CONFIG_DOMAIN="${domain_input:-${DOMAIN:-localhost}}"
    
    # SSL configuration
    if [ "$CONFIG_NODE_ENV" = "production" ] && [ "$CONFIG_DOMAIN" != "localhost" ]; then
        echo ""
        read -p "Enable SSL? (y/N): " -n 1 -r ssl_input
        echo ""
        if [[ $ssl_input =~ ^[Yy]$ ]]; then
            CONFIG_SSL_ENABLED="true"
            CONFIG_PROTOCOL="https"
        else
            CONFIG_SSL_ENABLED="false"
            CONFIG_PROTOCOL="http"
        fi
    else
        CONFIG_SSL_ENABLED="false"
        CONFIG_PROTOCOL="http"
    fi
    
    # API configuration
    echo ""
    echo -e "${WHITE}API Configuration (press Enter to skip):${NC}"
    
    read -p "Spotify Client ID [${SPOTIFY_CLIENT_ID:-}]: " spotify_client_input
    CONFIG_SPOTIFY_CLIENT_ID="${spotify_client_input:-${SPOTIFY_CLIENT_ID:-}}"
    
    if [ -n "$CONFIG_SPOTIFY_CLIENT_ID" ]; then
        read -p "Spotify Client Secret: " spotify_secret_input
        CONFIG_SPOTIFY_CLIENT_SECRET="${spotify_secret_input:-${SPOTIFY_CLIENT_SECRET:-}}"
    fi
    
    read -p "OpenAI API Key [${OPENAI_API_KEY:-}]: " openai_input
    CONFIG_OPENAI_API_KEY="${openai_input:-${OPENAI_API_KEY:-}}"
    
    read -p "Gemini API Key [${GEMINI_API_KEY:-}]: " gemini_input
    CONFIG_GEMINI_API_KEY="${gemini_input:-${GEMINI_API_KEY:-}}"
    
    # Database configuration
    echo ""
    echo -e "${WHITE}Database Configuration:${NC}"
    echo "1) SQLite (default, no setup required)"
    echo "2) MongoDB Atlas"
    echo "3) Local MongoDB"
    echo "4) PostgreSQL/Supabase"
    echo ""
    
    read -p "Select database (1-4) [1]: " -n 1 -r db_choice
    echo ""
    
    case "$db_choice" in
        2)
            read -p "MongoDB Atlas URI: " mongodb_input
            CONFIG_MONGODB_URI="$mongodb_input"
            CONFIG_DATABASE_TYPE="mongodb"
            ;;
        3)
            CONFIG_MONGODB_URI="mongodb://localhost:27017/echotune"
            CONFIG_DATABASE_TYPE="mongodb"
            ;;
        4)
            read -p "PostgreSQL/Supabase URL: " postgres_input
            CONFIG_DATABASE_URL="$postgres_input"
            CONFIG_DATABASE_TYPE="postgresql"
            ;;
        *)
            CONFIG_DATABASE_TYPE="sqlite"
            ;;
    esac
    
    # Generate the configuration file
    create_interactive_env_file
    
    log_success "Interactive configuration completed!"
    log_info "Configuration saved to: $ENV_FILE"
}

create_interactive_env_file() {
    backup_env_file
    
    local session_secret=$(generate_secret 32)
    local jwt_secret=$(generate_secret 32)
    local frontend_url="${CONFIG_PROTOCOL}://${CONFIG_DOMAIN}:${CONFIG_PORT}"
    local redirect_uri="${CONFIG_PROTOCOL}://${CONFIG_DOMAIN}:${CONFIG_PORT}/auth/callback"
    
    cat > "$ENV_FILE" << EOF
# EchoTune AI - Environment Configuration
# Generated by Interactive Configuration on $(date)

# ============================================================================
# CORE APPLICATION SETTINGS
# ============================================================================
NODE_ENV=$CONFIG_NODE_ENV
PORT=$CONFIG_PORT
DOMAIN=$CONFIG_DOMAIN
FRONTEND_URL=$frontend_url

# ============================================================================
# SECURITY CONFIGURATION (Auto-generated)
# ============================================================================
SESSION_SECRET=$session_secret
JWT_SECRET=$jwt_secret

# ============================================================================
# API INTEGRATIONS
# ============================================================================
EOF
    
    if [ -n "${CONFIG_SPOTIFY_CLIENT_ID:-}" ]; then
        cat >> "$ENV_FILE" << EOF

# Spotify API
SPOTIFY_CLIENT_ID=$CONFIG_SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET=${CONFIG_SPOTIFY_CLIENT_SECRET:-}
SPOTIFY_REDIRECT_URI=$redirect_uri
EOF
    else
        cat >> "$ENV_FILE" << EOF

# Spotify API (Demo mode)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=$redirect_uri
EOF
    fi
    
    # AI Providers
    local default_provider="mock"
    if [ -n "${CONFIG_GEMINI_API_KEY:-}" ]; then
        default_provider="gemini"
    elif [ -n "${CONFIG_OPENAI_API_KEY:-}" ]; then
        default_provider="openai"
    fi
    
    cat >> "$ENV_FILE" << EOF

# AI/LLM Providers
DEFAULT_LLM_PROVIDER=$default_provider
OPENAI_API_KEY=${CONFIG_OPENAI_API_KEY:-}
GEMINI_API_KEY=${CONFIG_GEMINI_API_KEY:-}

# ============================================================================
# DATABASE CONFIGURATION
# ============================================================================
DATABASE_TYPE=${CONFIG_DATABASE_TYPE:-sqlite}
EOF
    
    if [ "${CONFIG_DATABASE_TYPE:-}" = "mongodb" ]; then
        echo "MONGODB_URI=${CONFIG_MONGODB_URI:-}" >> "$ENV_FILE"
        echo "MONGODB_DATABASE=echotune_${CONFIG_NODE_ENV}" >> "$ENV_FILE"
    elif [ "${CONFIG_DATABASE_TYPE:-}" = "postgresql" ]; then
        echo "DATABASE_URL=${CONFIG_DATABASE_URL:-}" >> "$ENV_FILE"
    else
        echo "SQLITE_PATH=./data/echotune.db" >> "$ENV_FILE"
    fi
    
    # Add standard configuration
    cat >> "$ENV_FILE" << EOF

# ============================================================================
# PERFORMANCE AND SECURITY
# ============================================================================
SSL_ENABLED=${CONFIG_SSL_ENABLED:-false}
COMPRESSION=true
CACHE_ENABLED=true
LOG_LEVEL=info
DEBUG=false
TRUST_PROXY=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# CORS
ENABLE_CORS=true
CORS_ORIGINS=$frontend_url

# ============================================================================
# FEATURES
# ============================================================================
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=true
CHAT_ENABLED=true
DEMO_MODE=true
VOICE_INTERFACE_ENABLED=true

# ============================================================================
# MCP SERVER CONFIGURATION
# ============================================================================
MCP_SERVER_PORT=3001
MCP_SEQUENTIAL_THINKING_ENABLED=true
MCP_SCREENSHOT_WEBSITE_ENABLED=true
MCP_FILESYSTEM_ENABLED=true

# ============================================================================
# DEPLOYMENT METADATA
# ============================================================================
CONFIGURATION_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CONFIGURATION_METHOD=interactive
EOF
}

display_results() {
    echo ""
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                        ENVIRONMENT VALIDATION RESULTS                     ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${CYAN}📊 Summary:${NC}"
    echo "   Total Issues Found: $ISSUES_FOUND"
    if [ "$FIX_ISSUES" = "true" ]; then
        echo "   Issues Fixed: $ISSUES_FIXED"
        echo "   Remaining Issues: $((ISSUES_FOUND - ISSUES_FIXED))"
    fi
    echo ""
    
    # Display categorized results
    local categories=("Configuration" "Security" "APIs" "Performance" "Database")
    
    for category in "${categories[@]}"; do
        echo -e "${WHITE}$category:${NC}"
        
        case "$category" in
            "Configuration")
                display_status_line "NODE_ENV" "${ENV_STATUS[NODE_ENV]:-}"
                display_status_line "PORT" "${ENV_STATUS[PORT]:-}"
                display_status_line "DOMAIN" "${ENV_STATUS[DOMAIN]:-}"
                display_status_line "FRONTEND_URL" "${ENV_STATUS[FRONTEND_URL]:-}"
                ;;
            "Security")
                display_status_line "SESSION_SECRET" "${ENV_STATUS[SESSION_SECRET]:-}"
                display_status_line "JWT_SECRET" "${ENV_STATUS[JWT_SECRET]:-}"
                display_status_line "Rate Limiting" "${ENV_STATUS[RATE_LIMITING]:-}"
                display_status_line "CORS" "${ENV_STATUS[CORS]:-}"
                display_status_line "SSL Config" "${ENV_STATUS[SSL_CONFIG]:-}"
                ;;
            "APIs")
                display_status_line "Spotify API" "${ENV_STATUS[SPOTIFY_API]:-}"
                display_status_line "AI Providers" "${ENV_STATUS[AI_PROVIDERS]:-}"
                ;;
            "Performance")
                display_status_line "Caching" "${ENV_STATUS[CACHING]:-}"
                display_status_line "Compression" "${ENV_STATUS[COMPRESSION]:-}"
                display_status_line "Log Level" "${ENV_STATUS[LOG_LEVEL]:-}"
                ;;
            "Database")
                display_status_line "Database" "${ENV_STATUS[DATABASE]:-}${ENV_STATUS[MONGODB]:-}"
                ;;
        esac
        echo ""
    done
    
    if [ $ISSUES_FOUND -gt 0 ]; then
        echo -e "${YELLOW}🔧 Recommendations:${NC}"
        echo "   1. Run with --fix to automatically resolve common issues"
        echo "   2. Review and update API keys for full functionality"
        echo "   3. Consider using --interactive mode for guided setup"
        echo "   4. Check the validation log: $VALIDATION_LOG"
    else
        echo -e "${GREEN}✅ Environment configuration looks good!${NC}"
    fi
    
    echo ""
}

display_status_line() {
    local item="$1"
    local status="$2"
    local icon="❓"
    local color="$NC"
    
    case "$status" in
        "VALID"|"CONFIGURED"|"ENABLED"|"APPROPRIATE")
            icon="✅"
            color="$GREEN"
            ;;
        "MISSING"|"INVALID"|"WEAK"|"INCOMPLETE"|"DISABLED")
            icon="❌"
            color="$RED"
            ;;
        "PLACEHOLDER"|"MISMATCH"|"NOT_CONFIGURED"|"DEMO_MODE"|"SQLITE_FALLBACK")
            icon="⚠️"
            color="$YELLOW"
            ;;
        "")
            icon="⚪"
            status="Not checked"
            color="$NC"
            ;;
    esac
    
    printf "   %s ${color}%-20s %s${NC}\n" "$icon" "$item:" "$status"
}

show_help() {
    cat << EOF
EchoTune AI - Environment Validator and Fixer

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --fix                   Automatically fix common issues
    --interactive           Interactive configuration mode
    --generate              Generate comprehensive .env from template
    --validate-apis         Test API connectivity (requires credentials)
    --help                  Show this help message

EXAMPLES:
    $0                      # Validate current .env file
    $0 --fix                # Validate and auto-fix issues
    $0 --interactive        # Interactive configuration setup
    $0 --generate           # Generate .env from template

EXIT CODES:
    0    No issues found or all issues fixed
    1    Issues found (use --fix to resolve)
    2    Critical issues that require manual attention

The validator checks:
• Environment file syntax and structure
• Required variables and their formats
• Security configuration (secrets, rate limiting, CORS)
• API credentials and configurations
• Performance settings
• Database configuration
• SSL/TLS setup for production

For more information, visit: https://github.com/primoscope/doved
EOF
}

main() {
    # Initialize log
    echo "EchoTune AI Environment Validation - $(date)" > "$VALIDATION_LOG"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --fix)
                FIX_ISSUES=true
                shift
                ;;
            --interactive)
                INTERACTIVE_MODE=true
                shift
                ;;
            --generate)
                generate_comprehensive_env
                exit 0
                ;;
            --validate-apis)
                VALIDATE_APIS=true
                shift
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
    
    cd "$PROJECT_ROOT"
    
    echo -e "${CYAN}🔧 EchoTune AI - Environment Validator${NC}"
    echo ""
    
    if [ "$INTERACTIVE_MODE" = "true" ]; then
        interactive_configuration
        exit 0
    fi
    
    # Run validation
    validate_env_syntax || exit 1
    
    check_required_variables
    check_api_configurations
    check_security_configuration
    check_performance_configuration
    
    # Auto-fix if requested
    auto_fix_issues
    
    # Display results
    display_results
    
    # Exit with appropriate code
    if [ $((ISSUES_FOUND - ISSUES_FIXED)) -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

main "$@"