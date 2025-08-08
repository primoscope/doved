#!/bin/bash

# 🧙‍♂️ EchoTune AI - Interactive Installation Wizard
# Smart installation wizard for multiple servers, domains, and environments
# Supports Ubuntu production, DigitalOcean, and comprehensive configuration

set -e
set -o pipefail

# Enhanced error handling with user-friendly messages
trap 'handle_wizard_error $? $LINENO $BASH_COMMAND' ERR

# Colors and UI elements
declare -A UI=(
    [RED]='\033[0;31m'
    [GREEN]='\033[0;32m'
    [YELLOW]='\033[1;33m'
    [BLUE]='\033[0;34m'
    [PURPLE]='\033[0;35m'
    [CYAN]='\033[0;36m'
    [WHITE]='\033[1;37m'
    [BOLD]='\033[1m'
    [NC]='\033[0m'
    [CHECKMARK]='✅'
    [CROSSMARK]='❌'
    [WARNING]='⚠️'
    [INFO]='ℹ️'
    [ROCKET]='🚀'
    [GEAR]='⚙️'
    [MAGIC]='✨'
    [MUSIC]='🎵'
)

# Configuration State
declare -A CONFIG
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WIZARD_LOG="$PROJECT_ROOT/installation-wizard-$(date +%Y%m%d_%H%M%S).log"
WIZARD_CONFIG="$PROJECT_ROOT/.wizard-config.json"

# Installation Options
INSTALLATION_MODE=""  # interactive, guided, expert, quick
TARGET_ENVIRONMENT="" # production, staging, development
DEPLOYMENT_METHOD=""  # docker, native, digitalocean, custom
AUTO_CONFIGURE=true
VALIDATE_AFTER_INSTALL=true
SETUP_SSL=false
SETUP_MONITORING=false

# Server Configuration
declare -A SERVER_INFO
CURRENT_STEP=1
TOTAL_STEPS=10

# Advanced logging with pretty output
log_wizard() {
    local level="$1"
    local message="$2"
    local icon="$3"
    local color="${UI[${level}]:-${UI[NC]}}"
    local timestamp=$(date '+%H:%M:%S')
    
    echo -e "${color}${icon} [$timestamp] $message${UI[NC]}"
    echo "[$timestamp] [$level] $message" >> "$WIZARD_LOG"
}

log_info() { log_wizard "INFO" "$1" "${UI[INFO]}"; }
log_success() { log_wizard "SUCCESS" "$1" "${UI[CHECKMARK]}"; }
log_warning() { log_wizard "WARNING" "$1" "${UI[WARNING]}"; }
log_error() { log_wizard "ERROR" "$1" "${UI[CROSSMARK]}"; }
log_step() { log_wizard "STEP" "$1" "${UI[GEAR]}"; }
log_magic() { log_wizard "MAGIC" "$1" "${UI[MAGIC]}"; }

# Error handling with context
handle_wizard_error() {
    local exit_code=$1
    local line_number=$2
    local command="$3"
    
    echo ""
    echo -e "${UI[RED]}╔══════════════════════════════════════════════════════════════════════════════╗${UI[NC]}"
    echo -e "${UI[RED]}║                               🚨 WIZARD ERROR 🚨                            ║${UI[NC]}"
    echo -e "${UI[RED]}╚══════════════════════════════════════════════════════════════════════════════╝${UI[NC]}"
    echo ""
    
    log_error "Installation wizard encountered an error at line $line_number"
    log_error "Command: $command"
    log_error "Exit code: $exit_code"
    
    echo ""
    echo -e "${UI[YELLOW]}🔧 Troubleshooting Suggestions:${UI[NC]}"
    
    case $exit_code in
        1)
            echo "• Check your internet connection"
            echo "• Verify you have sufficient disk space"
            echo "• Ensure you have necessary permissions"
            ;;
        2)
            echo "• Check if all required dependencies are installed"
            echo "• Verify system compatibility"
            ;;
        126)
            echo "• Script permission issues - try: chmod +x $0"
            ;;
        127)
            echo "• Command not found - check if all dependencies are installed"
            ;;
        *)
            echo "• Review the installation log: $WIZARD_LOG"
            echo "• Check the comprehensive troubleshooting guide"
            ;;
    esac
    
    echo ""
    echo -e "${UI[CYAN]}📚 Get Help:${UI[NC]}"
    echo "• GitHub Issues: https://github.com/primoscope/doved/issues"
    echo "• Documentation: https://github.com/primoscope/doved#readme"
    echo "• Installation Log: $WIZARD_LOG"
    echo ""
    
    save_wizard_state "FAILED" "Error at line $line_number: $command"
    exit $exit_code
}

# Animated progress display
show_progress() {
    local current=$1
    local total=$2
    local description="$3"
    local width=50
    
    local progress=$((current * width / total))
    local percentage=$((current * 100 / total))
    
    printf "\r${UI[CYAN]}Progress: ["
    for ((i = 0; i < progress; i++)); do printf "█"; done
    for ((i = progress; i < width; i++)); do printf "░"; done
    printf "] %d%% - %s${UI[NC]}" "$percentage" "$description"
    
    if [ "$current" -eq "$total" ]; then
        echo ""
    fi
}

# Beautiful header with animation effect
print_wizard_header() {
    clear
    echo ""
    echo -e "${UI[PURPLE]}╔══════════════════════════════════════════════════════════════════════════════╗${UI[NC]}"
    echo -e "${UI[PURPLE]}║                          🧙‍♂️ INSTALLATION WIZARD 🧙‍♂️                        ║${UI[NC]}"
    echo -e "${UI[PURPLE]}║                        EchoTune AI Setup Assistant                         ║${UI[NC]}"
    echo -e "${UI[PURPLE]}╚══════════════════════════════════════════════════════════════════════════════╝${UI[NC]}"
    echo ""
    echo -e "${UI[CYAN]}${UI[MUSIC]} Welcome to the EchoTune AI Interactive Installation Wizard! ${UI[MUSIC]}${UI[NC]}"
    echo ""
    echo -e "${UI[WHITE]}This wizard will guide you through setting up EchoTune AI on:${UI[NC]}"
    echo -e "${UI[GREEN]}• Ubuntu/Debian production servers${UI[NC]}"
    echo -e "${UI[GREEN]}• DigitalOcean droplets${UI[NC]}"
    echo -e "${UI[GREEN]}• Development environments${UI[NC]}"
    echo -e "${UI[GREEN]}• Custom server configurations${UI[NC]}"
    echo ""
    
    show_progress $CURRENT_STEP $TOTAL_STEPS "Initializing wizard..."
    sleep 1
}

# Detect system information
detect_system_info() {
    log_step "Detecting system information..."
    
    # Operating System
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        SERVER_INFO[OS_NAME]="$NAME"
        SERVER_INFO[OS_VERSION]="$VERSION_ID"
        SERVER_INFO[OS_ID]="$ID"
    fi
    
    # Hardware
    SERVER_INFO[CPU_CORES]=$(nproc 2>/dev/null || echo "unknown")
    SERVER_INFO[MEMORY_GB]=$(free -g 2>/dev/null | awk '/^Mem:/{print $2}' || echo "unknown")
    SERVER_INFO[DISK_SPACE]=$(df -h / 2>/dev/null | awk 'NR==2{print $4}' || echo "unknown")
    
    # Network
    if curl -s --max-time 5 http://169.254.169.254/metadata/v1/id >/dev/null 2>&1; then
        SERVER_INFO[CLOUD_PROVIDER]="DigitalOcean"
        SERVER_INFO[PUBLIC_IP]=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || echo "unknown")
        SERVER_INFO[DROPLET_ID]=$(curl -s http://169.254.169.254/metadata/v1/id 2>/dev/null || echo "unknown")
    else
        SERVER_INFO[CLOUD_PROVIDER]="Unknown/On-Premise"
        SERVER_INFO[PUBLIC_IP]=$(curl -s http://ipinfo.io/ip 2>/dev/null || echo "unknown")
    fi
    
    # Current user and permissions
    SERVER_INFO[CURRENT_USER]="$USER"
    SERVER_INFO[HAS_SUDO]="false"
    if sudo -n true 2>/dev/null; then
        SERVER_INFO[HAS_SUDO]="true"
    fi
    
    log_success "System detection complete!"
}

# Display system information
show_system_info() {
    echo ""
    echo -e "${UI[CYAN]}╔══════════════════════════════════════════════════════════════════════════════╗${UI[NC]}"
    echo -e "${UI[CYAN]}║                            SYSTEM INFORMATION                             ║${UI[NC]}"
    echo -e "${UI[CYAN]}╚══════════════════════════════════════════════════════════════════════════════╝${UI[NC]}"
    echo ""
    
    printf "%-20s %s\n" "Operating System:" "${SERVER_INFO[OS_NAME]} ${SERVER_INFO[OS_VERSION]}"
    printf "%-20s %s\n" "Cloud Provider:" "${SERVER_INFO[CLOUD_PROVIDER]}"
    printf "%-20s %s\n" "Public IP:" "${SERVER_INFO[PUBLIC_IP]}"
    printf "%-20s %s\n" "CPU Cores:" "${SERVER_INFO[CPU_CORES]}"
    printf "%-20s %s GB\n" "Memory:" "${SERVER_INFO[MEMORY_GB]}"
    printf "%-20s %s\n" "Available Disk:" "${SERVER_INFO[DISK_SPACE]}"
    printf "%-20s %s\n" "Current User:" "${SERVER_INFO[CURRENT_USER]}"
    printf "%-20s %s\n" "Sudo Access:" "${SERVER_INFO[HAS_SUDO]}"
    
    echo ""
}

# Interactive mode selection
choose_installation_mode() {
    CURRENT_STEP=2
    show_progress $CURRENT_STEP $TOTAL_STEPS "Choosing installation mode..."
    
    echo ""
    echo -e "${UI[YELLOW]}🎯 Choose your installation experience:${UI[NC]}"
    echo ""
    echo "1) ${UI[GREEN]}Quick Setup${UI[NC]}      - Fastest installation with smart defaults"
    echo "2) ${UI[BLUE]}Guided Setup${UI[NC]}     - Step-by-step with recommendations"
    echo "3) ${UI[PURPLE]}Expert Setup${UI[NC]}     - Full control over all options"
    echo "4) ${UI[CYAN]}Production Setup${UI[NC]} - Optimized for production deployment"
    echo ""
    
    while true; do
        read -p "Select installation mode (1-4): " -n 1 -r
        echo ""
        
        case $REPLY in
            1)
                INSTALLATION_MODE="quick"
                log_success "Quick setup selected - using intelligent defaults"
                break
                ;;
            2)
                INSTALLATION_MODE="guided"
                log_success "Guided setup selected - step-by-step configuration"
                break
                ;;
            3)
                INSTALLATION_MODE="expert"
                log_success "Expert setup selected - full customization available"
                break
                ;;
            4)
                INSTALLATION_MODE="production"
                TARGET_ENVIRONMENT="production"
                SETUP_SSL=true
                SETUP_MONITORING=true
                log_success "Production setup selected - enterprise-grade configuration"
                break
                ;;
            *)
                echo -e "${UI[RED]}Invalid selection. Please choose 1-4.${UI[NC]}"
                ;;
        esac
    done
}

# Environment configuration
configure_environment() {
    CURRENT_STEP=3
    show_progress $CURRENT_STEP $TOTAL_STEPS "Configuring environment..."
    
    if [ "$INSTALLATION_MODE" = "quick" ]; then
        # Quick mode uses smart defaults
        if [ "${SERVER_INFO[CLOUD_PROVIDER]}" = "DigitalOcean" ]; then
            TARGET_ENVIRONMENT="production"
            CONFIG[DOMAIN]="${SERVER_INFO[PUBLIC_IP]}.nip.io"
            CONFIG[SSL_ENABLED]="true"
        else
            TARGET_ENVIRONMENT="development"
            CONFIG[DOMAIN]="localhost"
            CONFIG[SSL_ENABLED]="false"
        fi
        log_info "Environment auto-configured for $TARGET_ENVIRONMENT"
        return
    fi
    
    echo ""
    echo -e "${UI[YELLOW]}🌍 Environment Configuration:${UI[NC]}"
    echo ""
    echo "1) Development  - Local development with demo features"
    echo "2) Staging      - Pre-production testing environment"
    echo "3) Production   - Live production deployment"
    echo ""
    
    while true; do
        read -p "Select target environment (1-3): " -n 1 -r
        echo ""
        
        case $REPLY in
            1)
                TARGET_ENVIRONMENT="development"
                CONFIG[SSL_ENABLED]="false"
                CONFIG[MONITORING_ENABLED]="false"
                break
                ;;
            2)
                TARGET_ENVIRONMENT="staging"
                CONFIG[SSL_ENABLED]="true"
                CONFIG[MONITORING_ENABLED]="true"
                break
                ;;
            3)
                TARGET_ENVIRONMENT="production"
                CONFIG[SSL_ENABLED]="true"
                CONFIG[MONITORING_ENABLED]="true"
                SETUP_SSL=true
                SETUP_MONITORING=true
                break
                ;;
            *)
                echo -e "${UI[RED]}Invalid selection. Please choose 1-3.${UI[NC]}"
                ;;
        esac
    done
    
    log_success "Target environment: $TARGET_ENVIRONMENT"
}

# Domain and SSL configuration
configure_domain_ssl() {
    CURRENT_STEP=4
    show_progress $CURRENT_STEP $TOTAL_STEPS "Configuring domain and SSL..."
    
    echo ""
    echo -e "${UI[YELLOW]}🌐 Domain and SSL Configuration:${UI[NC]}"
    echo ""
    
    # Smart domain suggestion
    local suggested_domain=""
    if [ "${SERVER_INFO[CLOUD_PROVIDER]}" = "DigitalOcean" ] && [ "${SERVER_INFO[PUBLIC_IP]}" != "unknown" ]; then
        suggested_domain="${SERVER_INFO[PUBLIC_IP]}.nip.io"
        echo -e "${UI[INFO]} Detected DigitalOcean deployment"
        echo -e "${UI[INFO]} Suggested domain: ${UI[WHITE]}$suggested_domain${UI[NC]} (nip.io provides wildcard DNS)"
    fi
    
    if [ "$INSTALLATION_MODE" = "quick" ] && [ -n "$suggested_domain" ]; then
        CONFIG[DOMAIN]="$suggested_domain"
        CONFIG[SSL_ENABLED]="true"
        log_success "Domain auto-configured: ${CONFIG[DOMAIN]}"
        return
    fi
    
    echo "Domain options:"
    echo "1) Use localhost (development only)"
    echo "2) Use IP-based domain (${SERVER_INFO[PUBLIC_IP]}.nip.io)"
    echo "3) Enter custom domain"
    echo ""
    
    while true; do
        read -p "Select domain option (1-3): " -n 1 -r
        echo ""
        
        case $REPLY in
            1)
                CONFIG[DOMAIN]="localhost"
                CONFIG[SSL_ENABLED]="false"
                log_success "Using localhost domain"
                break
                ;;
            2)
                if [ "${SERVER_INFO[PUBLIC_IP]}" != "unknown" ]; then
                    CONFIG[DOMAIN]="${SERVER_INFO[PUBLIC_IP]}.nip.io"
                    CONFIG[SSL_ENABLED]="true"
                    log_success "Using IP-based domain: ${CONFIG[DOMAIN]}"
                    break
                else
                    echo -e "${UI[RED]}Cannot detect public IP. Please choose option 1 or 3.${UI[NC]}"
                fi
                ;;
            3)
                echo ""
                read -p "Enter your domain name (e.g., music.yourdomain.com): " domain_input
                if [[ "$domain_input" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
                    CONFIG[DOMAIN]="$domain_input"
                    
                    echo ""
                    read -p "Enable SSL for this domain? (Y/n): " -n 1 -r
                    echo ""
                    if [[ $REPLY =~ ^[Nn]$ ]]; then
                        CONFIG[SSL_ENABLED]="false"
                    else
                        CONFIG[SSL_ENABLED]="true"
                    fi
                    
                    log_success "Domain configured: ${CONFIG[DOMAIN]}"
                    break
                else
                    echo -e "${UI[RED]}Invalid domain format. Please try again.${UI[NC]}"
                fi
                ;;
            *)
                echo -e "${UI[RED]}Invalid selection. Please choose 1-3.${UI[NC]}"
                ;;
        esac
    done
    
    # SSL email configuration
    if [ "${CONFIG[SSL_ENABLED]}" = "true" ] && [ "${CONFIG[DOMAIN]}" != "localhost" ]; then
        echo ""
        read -p "Enter email for SSL certificate (Let's Encrypt): " ssl_email
        CONFIG[SSL_EMAIL]="${ssl_email:-admin@${CONFIG[DOMAIN]}}"
        log_success "SSL email: ${CONFIG[SSL_EMAIL]}"
    fi
}

# API Keys and Integrations
configure_api_keys() {
    CURRENT_STEP=5
    show_progress $CURRENT_STEP $TOTAL_STEPS "Configuring API integrations..."
    
    echo ""
    echo -e "${UI[YELLOW]}🔑 API Keys and Service Integrations:${UI[NC]}"
    echo ""
    echo -e "${UI[INFO]} EchoTune AI works in demo mode without API keys, but full functionality requires:"
    echo "• Spotify API (music data and playback)"
    echo "• AI Provider (OpenAI, Gemini, etc. for chat features)"
    echo "• MongoDB (for analytics and ML features)"
    echo ""
    
    if [ "$INSTALLATION_MODE" = "quick" ]; then
        echo -e "${UI[INFO]} Quick mode: Using demo configuration. You can add API keys later in .env file."
        CONFIG[DEMO_MODE]="true"
        return
    fi
    
    read -p "Configure API keys now? (Y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        CONFIG[DEMO_MODE]="true"
        log_info "Using demo mode - API keys can be added later"
        return
    fi
    
    CONFIG[DEMO_MODE]="false"
    
    # Spotify API
    echo ""
    echo -e "${UI[CYAN]}🎵 Spotify API Configuration:${UI[NC]}"
    echo "Get your keys at: https://developer.spotify.com/dashboard"
    echo ""
    read -p "Spotify Client ID (press Enter to skip): " spotify_client_id
    if [ -n "$spotify_client_id" ]; then
        CONFIG[SPOTIFY_CLIENT_ID]="$spotify_client_id"
        read -p "Spotify Client Secret: " spotify_client_secret
        CONFIG[SPOTIFY_CLIENT_SECRET]="$spotify_client_secret"
        log_success "Spotify API configured"
    fi
    
    # AI Provider
    echo ""
    echo -e "${UI[CYAN]}🤖 AI Provider Configuration:${UI[NC]}"
    echo "Choose your preferred AI provider:"
    echo "1) OpenAI (GPT models)"
    echo "2) Google Gemini (recommended)"
    echo "3) Both (fallback support)"
    echo "4) Skip (demo mode)"
    echo ""
    
    read -p "Select AI provider (1-4): " -n 1 -r
    echo ""
    
    case $REPLY in
        1)
            echo "Get your API key at: https://platform.openai.com/api-keys"
            read -p "OpenAI API Key (press Enter to skip): " openai_key
            if [ -n "$openai_key" ]; then
                CONFIG[OPENAI_API_KEY]="$openai_key"
                CONFIG[DEFAULT_LLM_PROVIDER]="openai"
                log_success "OpenAI configured"
            fi
            ;;
        2)
            echo "Get your API key at: https://makersuite.google.com/app/apikey"
            read -p "Gemini API Key (press Enter to skip): " gemini_key
            if [ -n "$gemini_key" ]; then
                CONFIG[GEMINI_API_KEY]="$gemini_key"
                CONFIG[DEFAULT_LLM_PROVIDER]="gemini"
                log_success "Gemini configured"
            fi
            ;;
        3)
            echo "OpenAI API Key:"
            read -p "OpenAI API Key (press Enter to skip): " openai_key
            if [ -n "$openai_key" ]; then
                CONFIG[OPENAI_API_KEY]="$openai_key"
            fi
            
            echo "Gemini API Key:"
            read -p "Gemini API Key (press Enter to skip): " gemini_key
            if [ -n "$gemini_key" ]; then
                CONFIG[GEMINI_API_KEY]="$gemini_key"
                CONFIG[DEFAULT_LLM_PROVIDER]="gemini"
            else
                CONFIG[DEFAULT_LLM_PROVIDER]="openai"
            fi
            log_success "Multiple AI providers configured"
            ;;
        4)
            log_info "Skipping AI provider configuration"
            ;;
    esac
    
    # MongoDB
    echo ""
    echo -e "${UI[CYAN]}🗄️ Database Configuration:${UI[NC]}"
    echo "Options:"
    echo "1) MongoDB Atlas (cloud, recommended for production)"
    echo "2) Local MongoDB (if installed)"
    echo "3) SQLite (lightweight, demo/development)"
    echo ""
    
    read -p "Select database option (1-3): " -n 1 -r
    echo ""
    
    case $REPLY in
        1)
            echo "MongoDB Atlas connection string format:"
            echo "mongodb+srv://username:password@cluster.mongodb.net/database"
            read -p "MongoDB Atlas URI (press Enter to skip): " mongodb_uri
            if [ -n "$mongodb_uri" ]; then
                CONFIG[MONGODB_URI]="$mongodb_uri"
                log_success "MongoDB Atlas configured"
            fi
            ;;
        2)
            CONFIG[MONGODB_URI]="mongodb://localhost:27017/echotune"
            log_success "Local MongoDB configured"
            ;;
        3)
            CONFIG[DATABASE_TYPE]="sqlite"
            log_success "SQLite database configured"
            ;;
    esac
}

# Deployment method selection
choose_deployment_method() {
    CURRENT_STEP=6
    show_progress $CURRENT_STEP $TOTAL_STEPS "Selecting deployment method..."
    
    if [ "$INSTALLATION_MODE" = "quick" ]; then
        # Auto-select best deployment method
        if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
            DEPLOYMENT_METHOD="docker"
            log_success "Docker deployment auto-selected"
        else
            DEPLOYMENT_METHOD="native"
            log_success "Native deployment auto-selected"
        fi
        return
    fi
    
    echo ""
    echo -e "${UI[YELLOW]}🚀 Deployment Method Selection:${UI[NC]}"
    echo ""
    
    # Check available methods
    local docker_available=false
    local native_available=false
    
    if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
        docker_available=true
        echo -e "1) ${UI[GREEN]}Docker Deployment${UI[NC]}     - Containerized (recommended)"
    else
        echo -e "1) ${UI[RED]}Docker Deployment${UI[NC]}     - Not available (Docker not installed/running)"
    fi
    
    if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
        native_available=true
        echo -e "2) ${UI[GREEN]}Native Deployment${UI[NC]}     - Direct installation"
    else
        echo -e "2) ${UI[RED]}Native Deployment${UI[NC]}     - Not available (Node.js not installed)"
    fi
    
    echo "3) Install Dependencies       - Set up missing requirements first"
    echo ""
    
    while true; do
        read -p "Select deployment method (1-3): " -n 1 -r
        echo ""
        
        case $REPLY in
            1)
                if [ "$docker_available" = true ]; then
                    DEPLOYMENT_METHOD="docker"
                    log_success "Docker deployment selected"
                    break
                else
                    echo -e "${UI[RED]}Docker is not available. Please install Docker first or choose option 3.${UI[NC]}"
                fi
                ;;
            2)
                if [ "$native_available" = true ]; then
                    DEPLOYMENT_METHOD="native"
                    log_success "Native deployment selected"
                    break
                else
                    echo -e "${UI[RED]}Node.js/npm not available. Please install Node.js first or choose option 3.${UI[NC]}"
                fi
                ;;
            3)
                install_dependencies
                # Re-check availability
                choose_deployment_method
                return
                ;;
            *)
                echo -e "${UI[RED]}Invalid selection. Please choose 1-3.${UI[NC]}"
                ;;
        esac
    done
}

# Install system dependencies
install_dependencies() {
    log_step "Installing system dependencies..."
    
    if [ "${SERVER_INFO[HAS_SUDO]}" != "true" ]; then
        log_error "Sudo access required to install system dependencies"
        echo "Please run: sudo -v"
        return 1
    fi
    
    # Detect package manager
    if command -v apt >/dev/null 2>&1; then
        install_ubuntu_dependencies
    elif command -v yum >/dev/null 2>&1; then
        install_centos_dependencies
    elif command -v brew >/dev/null 2>&1; then
        install_macos_dependencies
    else
        log_error "Unsupported package manager. Please install dependencies manually."
        return 1
    fi
}

# Ubuntu/Debian dependency installation
install_ubuntu_dependencies() {
    log_info "Installing Ubuntu/Debian dependencies..."
    
    export DEBIAN_FRONTEND=noninteractive
    
    # Update package list
    sudo apt-get update -qq
    
    # Essential packages
    local packages=(
        curl
        wget
        git
        build-essential
        software-properties-common
        apt-transport-https
        ca-certificates
        gnupg
        lsb-release
    )
    
    sudo apt-get install -y "${packages[@]}"
    
    # Node.js (if not installed)
    if ! command -v node >/dev/null 2>&1; then
        log_info "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    # Python (if not installed)
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "Installing Python..."
        sudo apt-get install -y python3 python3-pip python3-venv
    fi
    
    # Docker (if requested)
    if ! command -v docker >/dev/null 2>&1; then
        echo ""
        read -p "Install Docker? (Y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            log_info "Installing Docker..."
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker "$USER"
            log_success "Docker installed. Please log out and back in for group changes to take effect."
        fi
    fi
    
    # Nginx (for production)
    if [ "$TARGET_ENVIRONMENT" = "production" ] && ! command -v nginx >/dev/null 2>&1; then
        echo ""
        read -p "Install Nginx for production setup? (Y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            log_info "Installing Nginx..."
            sudo apt-get install -y nginx
        fi
    fi
    
    log_success "Ubuntu dependencies installed"
}

# Generate environment file
generate_environment_file() {
    CURRENT_STEP=7
    show_progress $CURRENT_STEP $TOTAL_STEPS "Generating environment configuration..."
    
    log_step "Creating optimized .env configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Backup existing .env
    if [ -f ".env" ]; then
        cp .env ".env.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "Existing .env backed up"
    fi
    
    # Generate comprehensive .env file
    cat > .env << EOF
# EchoTune AI - Environment Configuration
# Generated by Installation Wizard on $(date)
# Environment: $TARGET_ENVIRONMENT

# ============================================================================
# CORE APPLICATION SETTINGS
# ============================================================================
NODE_ENV=$TARGET_ENVIRONMENT
PORT=3000
DOMAIN=${CONFIG[DOMAIN]:-localhost}
FRONTEND_URL=http${CONFIG[SSL_ENABLED]:+s}://${CONFIG[DOMAIN]:-localhost}:3000

# ============================================================================
# SECURITY CONFIGURATION
# ============================================================================
SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "wizard_session_$(date +%s)_$(shuf -i 1000-9999 -n 1)")
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "wizard_jwt_$(date +%s)_$(shuf -i 1000-9999 -n 1)")

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# ============================================================================
# API INTEGRATIONS
# ============================================================================

# Spotify API
SPOTIFY_CLIENT_ID=${CONFIG[SPOTIFY_CLIENT_ID]:-}
SPOTIFY_CLIENT_SECRET=${CONFIG[SPOTIFY_CLIENT_SECRET]:-}
SPOTIFY_REDIRECT_URI=http${CONFIG[SSL_ENABLED]:+s}://${CONFIG[DOMAIN]:-localhost}:3000/auth/callback

# AI/LLM Providers
DEFAULT_LLM_PROVIDER=${CONFIG[DEFAULT_LLM_PROVIDER]:-mock}
OPENAI_API_KEY=${CONFIG[OPENAI_API_KEY]:-}
GEMINI_API_KEY=${CONFIG[GEMINI_API_KEY]:-}

# ============================================================================
# DATABASE CONFIGURATION
# ============================================================================
DATABASE_TYPE=${CONFIG[DATABASE_TYPE]:-sqlite}
MONGODB_URI=${CONFIG[MONGODB_URI]:-}
MONGODB_DATABASE=echotune_$TARGET_ENVIRONMENT

# Redis (optional)
REDIS_URL=${CONFIG[REDIS_URL]:-}

# ============================================================================
# SSL AND DOMAIN CONFIGURATION
# ============================================================================
SSL_ENABLED=${CONFIG[SSL_ENABLED]:-false}
LETSENCRYPT_EMAIL=${CONFIG[SSL_EMAIL]:-}

# ============================================================================
# FEATURE FLAGS
# ============================================================================
DEMO_MODE=${CONFIG[DEMO_MODE]:-true}
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=${CONFIG[MONITORING_ENABLED]:-false}
CHAT_ENABLED=true
VOICE_INTERFACE_ENABLED=true

# ============================================================================
# PERFORMANCE AND MONITORING
# ============================================================================
DEBUG=false
LOG_LEVEL=${TARGET_ENVIRONMENT:+info}${TARGET_ENVIRONMENT/production/warn}
TRUST_PROXY=true
COMPRESSION=true

# ============================================================================
# MCP SERVER CONFIGURATION
# ============================================================================
MCP_SERVER_PORT=3001
MCP_SEQUENTIAL_THINKING_ENABLED=true
MCP_SCREENSHOT_WEBSITE_ENABLED=true
MCP_FILESYSTEM_ENABLED=true

# ============================================================================
# DEPLOYMENT CONFIGURATION
# ============================================================================
DEPLOYMENT_METHOD=$DEPLOYMENT_METHOD
INSTALLATION_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
WIZARD_VERSION=1.0
EOF
    
    log_success "Environment file generated: .env"
    log_info "Configuration summary:"
    echo "  • Environment: $TARGET_ENVIRONMENT"
    echo "  • Domain: ${CONFIG[DOMAIN]:-localhost}"
    echo "  • SSL: ${CONFIG[SSL_ENABLED]:-false}"
    echo "  • Demo Mode: ${CONFIG[DEMO_MODE]:-true}"
    echo "  • Deployment: $DEPLOYMENT_METHOD"
}

# Install application dependencies
install_application() {
    CURRENT_STEP=8
    show_progress $CURRENT_STEP $TOTAL_STEPS "Installing application dependencies..."
    
    cd "$PROJECT_ROOT"
    
    log_step "Installing Node.js dependencies..."
    if [ "$TARGET_ENVIRONMENT" = "production" ]; then
        npm ci --only=production --silent
    else
        npm install --silent
    fi
    log_success "Node.js dependencies installed"
    
    # Python dependencies
    if [ -f "requirements.txt" ]; then
        log_step "Installing Python dependencies..."
        
        if [ ! -d "venv" ]; then
            python3 -m venv venv
            log_info "Python virtual environment created"
        fi
        
        source venv/bin/activate
        pip install --upgrade pip --quiet
        
        if [ "$TARGET_ENVIRONMENT" = "production" ] && [ -f "requirements-production.txt" ]; then
            pip install -r requirements-production.txt --quiet
        else
            pip install -r requirements.txt --quiet
        fi
        
        log_success "Python dependencies installed"
    fi
    
    # MCP Servers
    if [ -f "package.json" ] && grep -q "mcp" package.json; then
        log_step "Setting up MCP servers..."
        npm run mcp:install >/dev/null 2>&1 || log_warning "MCP server installation failed (non-critical)"
        log_success "MCP servers configured"
    fi
}

# Configure services (Nginx, SSL, etc.)
configure_services() {
    CURRENT_STEP=9
    show_progress $CURRENT_STEP $TOTAL_STEPS "Configuring services..."
    
    # Nginx configuration
    if [ "$TARGET_ENVIRONMENT" = "production" ] && [ "${CONFIG[SSL_ENABLED]}" = "true" ]; then
        configure_nginx_ssl
    fi
    
    # System service for production
    if [ "$TARGET_ENVIRONMENT" = "production" ] && [ "$DEPLOYMENT_METHOD" = "native" ]; then
        create_systemd_service
    fi
}

# Configure Nginx with SSL
configure_nginx_ssl() {
    if ! command -v nginx >/dev/null 2>&1; then
        log_warning "Nginx not installed - skipping web server configuration"
        return
    fi
    
    log_step "Configuring Nginx with SSL..."
    
    # Create Nginx configuration
    local nginx_config="/etc/nginx/sites-available/echotune"
    
    sudo tee "$nginx_config" > /dev/null << EOF
# EchoTune AI - Nginx Configuration
# Generated by Installation Wizard

server {
    listen 80;
    server_name ${CONFIG[DOMAIN]};
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${CONFIG[DOMAIN]};
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/${CONFIG[DOMAIN]}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CONFIG[DOMAIN]}/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=auth:10m rate=5r/m;
    
    # Proxy to application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # API rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
        # ... (other proxy settings)
    }
    
    # Auth rate limiting
    location /auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://localhost:3000;
        # ... (other proxy settings)
    }
}
EOF
    
    # Enable site
    sudo ln -sf "$nginx_config" /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    
    log_success "Nginx configured for ${CONFIG[DOMAIN]}"
    
    # Setup SSL certificate
    if [ "${CONFIG[DOMAIN]}" != "localhost" ] && [ -n "${CONFIG[SSL_EMAIL]}" ]; then
        setup_ssl_certificate
    fi
}

# Setup SSL certificate with Let's Encrypt
setup_ssl_certificate() {
    log_step "Setting up SSL certificate..."
    
    if ! command -v certbot >/dev/null 2>&1; then
        sudo apt-get install -y certbot python3-certbot-nginx
    fi
    
    # Request certificate
    sudo certbot --nginx \
        --non-interactive \
        --agree-tos \
        --email "${CONFIG[SSL_EMAIL]}" \
        --domains "${CONFIG[DOMAIN]}" \
        --redirect
    
    if [ $? -eq 0 ]; then
        log_success "SSL certificate installed for ${CONFIG[DOMAIN]}"
        
        # Set up auto-renewal
        (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
        log_success "SSL auto-renewal configured"
    else
        log_warning "SSL certificate installation failed - manual setup required"
    fi
}

# Create systemd service
create_systemd_service() {
    log_step "Creating system service..."
    
    sudo tee /etc/systemd/system/echotune.service > /dev/null << EOF
[Unit]
Description=EchoTune AI - Music Discovery Platform
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_ROOT
Environment=NODE_ENV=$TARGET_ENVIRONMENT
EnvironmentFile=$PROJECT_ROOT/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable echotune
    
    log_success "System service created and enabled"
}

# Deploy application
deploy_application() {
    CURRENT_STEP=10
    show_progress $CURRENT_STEP $TOTAL_STEPS "Deploying application..."
    
    cd "$PROJECT_ROOT"
    
    case "$DEPLOYMENT_METHOD" in
        "docker")
            deploy_with_docker
            ;;
        "native")
            deploy_native
            ;;
        *)
            log_error "Unknown deployment method: $DEPLOYMENT_METHOD"
            return 1
            ;;
    esac
}

# Docker deployment
deploy_with_docker() {
    log_step "Deploying with Docker..."
    
    # Stop existing containers
    docker-compose down --timeout 10 2>/dev/null || true
    
    # Build and start
    docker-compose up -d --build
    
    # Wait for health check
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "http://localhost:3000/health" >/dev/null 2>&1; then
            log_success "Application deployed and healthy!"
            return 0
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_warning "Application deployed but health check failed"
    return 1
}

# Native deployment
deploy_native() {
    log_step "Deploying natively..."
    
    # Start application based on environment
    if [ "$TARGET_ENVIRONMENT" = "production" ]; then
        sudo systemctl start echotune
        
        # Wait for service to start
        sleep 5
        
        if sudo systemctl is-active --quiet echotune; then
            log_success "Application service started successfully!"
        else
            log_error "Application service failed to start"
            return 1
        fi
    else
        # Development mode - start in background
        nohup npm start > logs/app.log 2>&1 &
        echo $! > echotune.pid
        
        # Wait for application to start
        sleep 5
        
        if curl -f -s "http://localhost:3000/health" >/dev/null 2>&1; then
            log_success "Application started successfully! (PID: $(cat echotune.pid))"
        else
            log_warning "Application started but health check failed"
        fi
    fi
}

# Save wizard state for recovery
save_wizard_state() {
    local status="$1"
    local message="$2"
    
    cat > "$WIZARD_CONFIG" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "status": "$status",
    "message": "$message",
    "installation_mode": "$INSTALLATION_MODE",
    "target_environment": "$TARGET_ENVIRONMENT",
    "deployment_method": "$DEPLOYMENT_METHOD",
    "config": $(printf '%s\n' "${!CONFIG[@]}" | while read key; do echo "\"$key\": \"${CONFIG[$key]}\""; done | paste -sd ',' | sed 's/^/{/' | sed 's/$/}/')
}
EOF
}

# Final validation and success display
final_validation() {
    log_step "Performing final validation..."
    
    # Run comprehensive validation
    if [ -f "scripts/comprehensive-deployment-validator.sh" ]; then
        chmod +x scripts/comprehensive-deployment-validator.sh
        if scripts/comprehensive-deployment-validator.sh --quick >/dev/null 2>&1; then
            log_success "All validation checks passed!"
        else
            log_warning "Some validation checks failed - see logs for details"
        fi
    fi
    
    # Test main endpoints
    local base_url="http${CONFIG[SSL_ENABLED]:+s}://${CONFIG[DOMAIN]:-localhost}:3000"
    
    if curl -f -s "$base_url/health" >/dev/null 2>&1; then
        log_success "Health endpoint is responding"
    else
        log_warning "Health endpoint not responding"
    fi
    
    if curl -f -s "$base_url/" >/dev/null 2>&1; then
        log_success "Main application is accessible"
    else
        log_warning "Main application not responding"
    fi
}

# Beautiful success screen
show_success_screen() {
    clear
    echo ""
    echo -e "${UI[GREEN]}╔══════════════════════════════════════════════════════════════════════════════╗${UI[NC]}"
    echo -e "${UI[GREEN]}║                           🎉 INSTALLATION COMPLETE! 🎉                    ║${UI[NC]}"
    echo -e "${UI[GREEN]}╚══════════════════════════════════════════════════════════════════════════════╝${UI[NC]}"
    echo ""
    
    log_magic "EchoTune AI has been successfully installed and configured!"
    echo ""
    
    # Access information
    local base_url="http${CONFIG[SSL_ENABLED]:+s}://${CONFIG[DOMAIN]:-localhost}:3000"
    
    echo -e "${UI[CYAN]}🌐 Access Your EchoTune AI:${UI[NC]}"
    echo "   🔗 Main Application: $base_url"
    echo "   💬 Chat Interface: $base_url/chat"
    echo "   📊 Health Check: $base_url/health"
    
    if [ "${CONFIG[DOMAIN]}" != "localhost" ]; then
        echo "   🔗 Also accessible via: http://localhost:3000"
    fi
    echo ""
    
    # Configuration summary
    echo -e "${UI[CYAN]}📋 Installation Summary:${UI[NC]}"
    printf "   %-20s %s\n" "Environment:" "$TARGET_ENVIRONMENT"
    printf "   %-20s %s\n" "Deployment Method:" "$DEPLOYMENT_METHOD"
    printf "   %-20s %s\n" "Domain:" "${CONFIG[DOMAIN]:-localhost}"
    printf "   %-20s %s\n" "SSL Enabled:" "${CONFIG[SSL_ENABLED]:-false}"
    printf "   %-20s %s\n" "Demo Mode:" "${CONFIG[DEMO_MODE]:-true}"
    echo ""
    
    # Management commands
    echo -e "${UI[CYAN]}🔧 Management Commands:${UI[NC]}"
    case "$DEPLOYMENT_METHOD" in
        "docker")
            echo "   🐳 Docker Status: docker-compose ps"
            echo "   📝 View Logs: docker-compose logs -f"
            echo "   🔄 Restart: docker-compose restart"
            echo "   🛑 Stop: docker-compose down"
            ;;
        "native")
            if [ "$TARGET_ENVIRONMENT" = "production" ]; then
                echo "   📊 Service Status: sudo systemctl status echotune"
                echo "   📝 View Logs: sudo journalctl -u echotune -f"
                echo "   🔄 Restart: sudo systemctl restart echotune"
                echo "   🛑 Stop: sudo systemctl stop echotune"
            else
                echo "   📊 Check Process: ps aux | grep node"
                echo "   📝 View Logs: tail -f logs/app.log"
                echo "   🛑 Stop: kill \$(cat echotune.pid)"
            fi
            ;;
    esac
    echo ""
    
    # Next steps
    echo -e "${UI[YELLOW]}🚀 Next Steps:${UI[NC]}"
    if [ "${CONFIG[DEMO_MODE]}" = "true" ]; then
        echo "   1. ${UI[MUSIC]} Try the demo features - no API keys required!"
        echo "   2. 🔑 Add API keys to .env for full functionality"
        echo "   3. 🎵 Connect your Spotify account for personalized features"
    else
        echo "   1. 🎵 Connect your Spotify account"
        echo "   2. 💬 Try the AI-powered music chat"
        echo "   3. 📊 Explore the analytics dashboard"
    fi
    echo "   4. 📚 Read the documentation for advanced features"
    echo "   5. 🔧 Customize settings in the .env file"
    echo ""
    
    # Files and logs
    echo -e "${UI[CYAN]}📁 Important Files:${UI[NC]}"
    echo "   🔧 Configuration: $PROJECT_ROOT/.env"
    echo "   📝 Installation Log: $WIZARD_LOG"
    echo "   🔍 Validation Reports: $PROJECT_ROOT/deployment-validation-report-*.md"
    echo ""
    
    # Help resources
    echo -e "${UI[CYAN]}💡 Need Help?${UI[NC]}"
    echo "   📚 Documentation: https://github.com/primoscope/doved#readme"
    echo "   🐛 Issues: https://github.com/primoscope/doved/issues"
    echo "   💬 Community: GitHub Discussions"
    echo ""
    
    save_wizard_state "SUCCESS" "Installation completed successfully"
    
    echo -e "${UI[GREEN]}${UI[MUSIC]} Enjoy your AI-powered music discovery experience! ${UI[MUSIC]}${UI[NC]}"
    echo ""
}

# Main wizard execution
main() {
    # Initialize logging
    echo "EchoTune AI Installation Wizard - $(date)" > "$WIZARD_LOG"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --quick)
                INSTALLATION_MODE="quick"
                AUTO_CONFIGURE=true
                shift
                ;;
            --production)
                TARGET_ENVIRONMENT="production"
                SETUP_SSL=true
                SETUP_MONITORING=true
                shift
                ;;
            --domain)
                CONFIG[DOMAIN]="$2"
                shift 2
                ;;
            --help)
                show_wizard_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_wizard_help
                exit 1
                ;;
        esac
    done
    
    # Check if we're in the right directory
    cd "$PROJECT_ROOT"
    
    # Start the wizard
    print_wizard_header
    
    # System detection
    detect_system_info
    show_system_info
    
    # Wait for user to review system info
    if [ "$INSTALLATION_MODE" != "quick" ]; then
        echo ""
        read -p "Press Enter to continue with installation..." -r
    fi
    
    # Wizard steps
    choose_installation_mode
    configure_environment
    configure_domain_ssl
    configure_api_keys
    choose_deployment_method
    generate_environment_file
    install_application
    configure_services
    deploy_application
    
    # Final validation
    final_validation
    
    # Success!
    show_success_screen
}

# Help function
show_wizard_help() {
    cat << EOF
EchoTune AI - Interactive Installation Wizard

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --quick                 Quick installation with smart defaults
    --production            Production setup with SSL and monitoring
    --domain DOMAIN         Specify domain name for SSL setup
    --help                  Show this help message

EXAMPLES:
    $0                      # Interactive installation
    $0 --quick              # Quick setup with defaults
    $0 --production         # Production deployment
    $0 --domain music.com   # Custom domain setup

FEATURES:
    • Interactive configuration wizard
    • Multiple deployment methods (Docker, Native)
    • Automatic SSL setup with Let's Encrypt
    • Smart defaults based on system detection
    • Comprehensive validation and testing
    • Production-ready configurations
    • Multi-server deployment support

For more information, visit: https://github.com/primoscope/doved
EOF
}

# Execute main function
main "$@"