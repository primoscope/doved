#!/bin/bash

# 🔧 EchoTune AI - Simplified Deployment Utilities
# Robust utilities for deployment with minimal dependencies

# Prevent double-loading
if [[ "${DEPLOYMENT_UTILS_SIMPLE_LOADED:-}" == "true" ]]; then
    return 0
fi
export DEPLOYMENT_UTILS_SIMPLE_LOADED=true

# =============================================================================
# COLOR CODES AND LOGGING
# =============================================================================

# Color codes (with fallback for systems without color support)
if [[ -t 2 ]] && command -v tput &>/dev/null && tput colors &>/dev/null && [[ $(tput colors) -ge 8 ]]; then
    export RED='\033[0;31m'
    export GREEN='\033[0;32m'
    export YELLOW='\033[1;33m'
    export BLUE='\033[0;34m'
    export PURPLE='\033[0;35m'
    export CYAN='\033[0;36m'
    export WHITE='\033[1;37m'
    export NC='\033[0m'
else
    # No color support - use empty strings
    export RED=''
    export GREEN=''
    export YELLOW=''
    export BLUE=''
    export PURPLE=''
    export CYAN=''
    export WHITE=''
    export NC=''
fi

# Enhanced logging functions with timestamps and proper error handling
log_info() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}[ERROR]${NC} $1" >&2
}

log_step() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}[STEP]${NC} $1" >&2
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${CYAN}[DEBUG]${NC} $1" >&2
    fi
}

# =============================================================================
# ERROR HANDLING AND VALIDATION
# =============================================================================

# Enhanced error handling function with detailed help
exit_with_help() {
    local error_message="$1"
    local help_text="$2"
    local cleanup_function="${3:-}"
    
    echo "" >&2
    log_error "$error_message"
    echo "" >&2
    
    if [[ -n "$help_text" ]]; then
        echo -e "${YELLOW}💡 Troubleshooting Guide:${NC}" >&2
        echo "$help_text" | sed 's/^/   /' >&2
        echo "" >&2
    fi
    
    echo -e "${CYAN}📚 Additional Resources:${NC}" >&2
    echo "   - Documentation: README.md" >&2
    echo "   - Deployment Guide: DEPLOYMENT_GUIDE.md" >&2
    echo "   - Issues: https://github.com/primoscope/doved/issues" >&2
    echo "" >&2
    
    # Call cleanup function if provided
    if [[ -n "$cleanup_function" ]] && command -v "$cleanup_function" &>/dev/null; then
        log_info "Running cleanup function: $cleanup_function"
        "$cleanup_function" || true
    fi
    
    exit 1
}

# Command existence check with fallback
command_exists() {
    command -v "$1" &>/dev/null
}

# =============================================================================
# SYSTEM UTILITIES
# =============================================================================

# Robust directory creation with permission handling
create_directory_safe() {
    local dir_path="$1"
    local owner="${2:-$USER}"
    local permissions="${3:-755}"
    
    log_debug "Creating directory: $dir_path (owner: $owner, permissions: $permissions)"
    
    # Check if directory already exists
    if [[ -d "$dir_path" ]]; then
        log_debug "Directory already exists: $dir_path"
        return 0
    fi
    
    # Create directory with parents
    if ! mkdir -p "$dir_path" 2>/dev/null; then
        log_error "Failed to create directory: $dir_path"
        return 1
    fi
    
    # Set permissions
    if ! chmod "$permissions" "$dir_path" 2>/dev/null; then
        log_warning "Failed to set permissions on directory: $dir_path"
        # Continue - not critical
    fi
    
    # Set ownership if not current user and we have sudo
    if [[ "$owner" != "$USER" ]] && command_exists sudo; then
        if ! sudo chown "$owner:$owner" "$dir_path" 2>/dev/null; then
            log_warning "Failed to set ownership on directory: $dir_path"
            # Continue - not critical
        fi
    fi
    
    log_success "Directory created: $dir_path"
    return 0
}

# Enhanced package installation with multiple package managers
install_packages_apt() {
    local packages=("$@")
    
    if [[ ${#packages[@]} -eq 0 ]]; then
        log_warning "No packages specified for installation"
        return 0
    fi
    
    log_info "Installing packages: ${packages[*]}"
    
    # Update package lists first
    if ! sudo apt update -qq 2>/dev/null; then
        log_warning "Failed to update package lists, continuing anyway"
    fi
    
    # Install packages with retry logic
    local max_retries=3
    local retry=0
    
    while [[ $retry -lt $max_retries ]]; do
        if sudo apt install -y "${packages[@]}" 2>/dev/null; then
            log_success "Packages installed successfully"
            return 0
        fi
        
        retry=$((retry + 1))
        if [[ $retry -lt $max_retries ]]; then
            log_warning "Package installation failed, retrying ($retry/$max_retries)..."
            sleep 2
        fi
    done
    
    log_error "Failed to install packages after $max_retries attempts"
    return 1
}

# User group management
add_user_to_group() {
    local user="$1"
    local group="$2"
    
    if groups "$user" | grep -q "\b$group\b"; then
        log_debug "User $user is already in group $group"
        return 0
    fi
    
    if sudo usermod -aG "$group" "$user" 2>/dev/null; then
        log_success "Added user $user to group $group"
        log_info "Note: Group membership will take effect after logout/login"
        return 0
    else
        log_error "Failed to add user $user to group $group"
        return 1
    fi
}

# =============================================================================
# DOCKER UTILITIES
# =============================================================================

# Wait for Docker daemon to be ready
wait_for_docker() {
    local timeout="${1:-30}"
    local waited=0
    
    log_info "Waiting for Docker daemon to be ready..."
    
    while [[ $waited -lt $timeout ]]; do
        if docker info &>/dev/null; then
            log_success "Docker daemon is ready"
            return 0
        fi
        
        waited=$((waited + 1))
        sleep 1
    done
    
    log_error "Docker daemon not ready after ${timeout}s"
    return 1
}

# =============================================================================
# NETWORK AND CONNECTIVITY
# =============================================================================

# Check if a port is available
check_port_available() {
    local port="$1"
    
    if command_exists netstat; then
        if netstat -ln | grep -q ":$port "; then
            return 1  # Port is in use
        fi
    elif command_exists ss; then
        if ss -ln | grep -q ":$port "; then
            return 1  # Port is in use
        fi
    else
        # Fallback: try to bind to port briefly
        if ! (exec 3<>/dev/tcp/localhost/"$port") 2>/dev/null; then
            return 0  # Port appears available
        else
            exec 3<&-
            exec 3>&-
            return 1  # Port is in use
        fi
    fi
    
    return 0  # Port appears available
}

# Test network connectivity
check_connectivity() {
    local host="${1:-8.8.8.8}"
    local timeout="${2:-5}"
    
    if command_exists ping; then
        if ping -c 1 -W "$timeout" "$host" &>/dev/null; then
            return 0
        fi
    fi
    
    # Fallback using curl
    if command_exists curl; then
        if curl -s --connect-timeout "$timeout" --max-time "$timeout" "http://$host" &>/dev/null; then
            return 0
        fi
    fi
    
    return 1
}

# =============================================================================
# FILE AND DIRECTORY ANALYSIS
# =============================================================================

# Get directory size in human readable format
get_directory_size() {
    local dir="$1"
    
    if [[ ! -d "$dir" ]]; then
        echo "0"
        return 1
    fi
    
    if command_exists du; then
        du -sh "$dir" 2>/dev/null | cut -f1
    else
        echo "unknown"
    fi
}

# Count files in directory
count_files() {
    local dir="$1"
    local pattern="${2:-*}"
    
    if [[ ! -d "$dir" ]]; then
        echo "0"
        return 1
    fi
    
    # Use find for more reliable counting
    find "$dir" -name "$pattern" -type f 2>/dev/null | wc -l
}

# Get largest files in directory
get_largest_files() {
    local dir="$1"
    local count="${2:-10}"
    
    if [[ ! -d "$dir" ]]; then
        return 1
    fi
    
    if command_exists find && command_exists du; then
        find "$dir" -type f -exec du -h {} + 2>/dev/null | \
            sort -hr | \
            head -n "$count"
    fi
}

# =============================================================================
# DEPENDENCY ANALYSIS
# =============================================================================

# Analyze npm dependencies
analyze_npm_dependencies() {
    local package_json="${1:-package.json}"
    
    if [[ ! -f "$package_json" ]]; then
        log_error "package.json not found: $package_json"
        return 1
    fi
    
    log_info "Analyzing npm dependencies..."
    
    # Count dependencies
    local deps_count=0
    local dev_deps_count=0
    
    if command_exists jq && jq -r '.dependencies | keys[]' "$package_json" &>/dev/null; then
        deps_count=$(jq -r '.dependencies | keys | length' "$package_json" 2>/dev/null || echo 0)
        dev_deps_count=$(jq -r '.devDependencies | keys | length' "$package_json" 2>/dev/null || echo 0)
    else
        # Fallback counting method
        deps_count=$(grep -c '".*":' "$package_json" 2>/dev/null || echo 0)
    fi
    
    echo "Dependencies: $deps_count"
    echo "Dev Dependencies: $dev_deps_count"
    
    # Check for security vulnerabilities if npm is available
    if command_exists npm; then
        log_info "Checking for security vulnerabilities..."
        if npm audit --audit-level=high --json &>/dev/null; then
            log_success "No high-severity vulnerabilities found"
        else
            log_warning "Security vulnerabilities detected - run 'npm audit' for details"
        fi
    fi
}

# =============================================================================
# PERFORMANCE MONITORING
# =============================================================================

# Get system resource usage
get_system_resources() {
    echo "=== System Resources ==="
    
    # Memory usage
    if command_exists free; then
        echo "Memory:"
        free -h | head -2
        echo ""
    fi
    
    # Disk usage
    if command_exists df; then
        echo "Disk:"
        df -h / | tail -1
        echo ""
    fi
    
    # CPU load
    if [[ -f /proc/loadavg ]]; then
        echo "Load Average:"
        cat /proc/loadavg
        echo ""
    fi
    
    # Process count
    if command_exists ps; then
        echo "Process Count:"
        ps aux | wc -l
        echo ""
    fi
}

# =============================================================================
# CLEANUP UTILITIES
# =============================================================================

# Generic cleanup function
cleanup_deployment() {
    log_info "Running deployment cleanup..."
    
    # Stop any running Docker containers in current directory
    if [[ -f "docker-compose.yml" ]] && command_exists docker-compose; then
        log_info "Stopping Docker containers..."
        docker-compose down --timeout 10 &>/dev/null || true
    fi
    
    # Clean up temporary files
    if [[ -n "${TEMP_DIR:-}" ]] && [[ -d "$TEMP_DIR" ]]; then
        log_info "Removing temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR" || true
    fi
    
    # Clean up any background processes we might have started
    # (This would need to be customized based on specific deployment needs)
    
    log_info "Cleanup completed"
}

# =============================================================================
# VALIDATION UTILITIES
# =============================================================================

# Validate environment file
validate_env_file() {
    local env_file="${1:-.env}"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi
    
    log_info "Validating environment file: $env_file"
    
    # Check for syntax errors
    if ! bash -n "$env_file" 2>/dev/null; then
        log_error "Environment file has bash syntax errors"
        return 1
    fi
    
    # Check for common issues
    local issues=()
    
    # Check for unquoted values with spaces
    if grep -q '=[^"'"'"'].*[[:space:]].*[^"'"'"']$' "$env_file"; then
        issues+=("Unquoted values with spaces detected")
    fi
    
    # Check for missing values
    if grep -q '=$' "$env_file"; then
        issues+=("Empty values detected")
    fi
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        log_warning "Environment file issues detected:"
        for issue in "${issues[@]}"; do
            echo "  - $issue" >&2
        done
    fi
    
    log_success "Environment file validation completed"
    return 0
}

# =============================================================================
# INITIALIZATION
# =============================================================================

# Set up error handling
set -eE  # Exit on error, including in functions
set -o pipefail  # Fail on pipe errors

# Export all functions for use in other scripts
export -f log_info log_success log_warning log_error log_step log_debug
export -f exit_with_help command_exists create_directory_safe
export -f install_packages_apt add_user_to_group wait_for_docker
export -f check_port_available check_connectivity get_directory_size
export -f count_files get_largest_files analyze_npm_dependencies
export -f get_system_resources cleanup_deployment validate_env_file

log_debug "Deployment utilities library loaded successfully"