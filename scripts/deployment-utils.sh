#!/bin/bash

# 🔧 EchoTune AI - Deployment Utilities Library
# Shared utilities for robust, consistent deployment across all scripts

# Ensure this library is only sourced once
if [[ "${DEPLOYMENT_UTILS_LOADED:-}" == "true" ]]; then
    return 0
fi
export DEPLOYMENT_UTILS_LOADED=true

# =============================================================================
# COLOR CODES AND LOGGING
# =============================================================================

# Color codes for consistent output
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export PURPLE='\033[0;35m'
export CYAN='\033[0;36m'
export WHITE='\033[1;37m'
export NC='\033[0m' # No Color

# Logging functions with consistent format
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1" >&2
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $1" >&2
    fi
}

# =============================================================================
# PACKAGE MANAGEMENT UTILITIES
# =============================================================================

# Robust package installation with proper error handling
install_packages_apt() {
    local packages=("$@")
    
    if [ ${#packages[@]} -eq 0 ]; then
        log_warning "No packages specified for installation"
        return 0
    fi
    
    log_info "Installing packages: ${packages[*]}"
    
    # Set non-interactive mode to prevent prompts
    export DEBIAN_FRONTEND=noninteractive
    
    # Update package lists with error handling
    local max_retries=3
    local retry=0
    
    while [ $retry -lt $max_retries ]; do
        log_debug "Updating package lists (attempt $((retry + 1))/$max_retries)"
        
        if sudo apt-get update -qq -o Dpkg::Use-Pty=0 2>/dev/null; then
            log_debug "Package lists updated successfully"
            break
        else
            retry=$((retry + 1))
            if [ $retry -lt $max_retries ]; then
                log_warning "Package update failed, retrying in 5 seconds..."
                sleep 5
            else
                log_error "Failed to update package lists after $max_retries attempts"
                return 1
            fi
        fi
    done
    
    # Install packages with proper error handling and non-interactive flags
    local install_cmd="sudo apt-get install -y -qq -o Dpkg::Use-Pty=0 -o Dpkg::Options::='--force-confdef' -o Dpkg::Options::='--force-confold'"
    
    # Try installing all packages at once first
    if eval "$install_cmd ${packages[*]}" 2>/dev/null; then
        log_success "All packages installed successfully"
        return 0
    else
        log_warning "Batch installation failed, trying individual packages"
        
        # If batch fails, try installing packages individually
        local failed_packages=()
        for package in "${packages[@]}"; do
            log_debug "Installing package: $package"
            if eval "$install_cmd $package" 2>/dev/null; then
                log_debug "Package $package installed successfully"
            else
                log_warning "Failed to install package: $package"
                failed_packages+=("$package")
            fi
        done
        
        # Report results
        if [ ${#failed_packages[@]} -eq 0 ]; then
            log_success "All packages installed successfully (individually)"
            return 0
        else
            log_error "Failed to install packages: ${failed_packages[*]}"
            return 1
        fi
    fi
}

# Check if packages are installed
check_packages() {
    local packages=("$@")
    local missing=()
    
    for package in "${packages[@]}"; do
        if ! dpkg -l "$package" >/dev/null 2>&1; then
            missing+=("$package")
        fi
    done
    
    if [ ${#missing[@]} -eq 0 ]; then
        return 0
    else
        echo "${missing[*]}"
        return 1
    fi
}

# =============================================================================
# PERMISSION UTILITIES
# =============================================================================

# Robust directory creation with proper permissions
create_directory_safe() {
    local dir_path="$1"
    local owner="${2:-$USER}"
    local permissions="${3:-755}"
    
    if [ -z "$dir_path" ]; then
        log_error "Directory path not specified"
        return 1
    fi
    
    log_debug "Creating directory: $dir_path (owner: $owner, permissions: $permissions)"
    
    # Create directory if it doesn't exist
    if [ ! -d "$dir_path" ]; then
        if ! mkdir -p "$dir_path" 2>/dev/null; then
            # Try with sudo if regular mkdir fails
            log_debug "Regular mkdir failed, trying with sudo"
            if ! sudo mkdir -p "$dir_path"; then
                log_error "Failed to create directory: $dir_path"
                return 1
            fi
        fi
    fi
    
    # Set ownership if specified and different from current
    if [ "$owner" != "$(stat -c '%U' "$dir_path" 2>/dev/null)" ]; then
        log_debug "Setting ownership of $dir_path to $owner"
        if ! sudo chown "$owner:$owner" "$dir_path" 2>/dev/null; then
            log_warning "Failed to set ownership of $dir_path to $owner"
        fi
    fi
    
    # Set permissions
    log_debug "Setting permissions of $dir_path to $permissions"
    if ! chmod "$permissions" "$dir_path" 2>/dev/null; then
        if ! sudo chmod "$permissions" "$dir_path" 2>/dev/null; then
            log_warning "Failed to set permissions of $dir_path to $permissions"
        fi
    fi
    
    return 0
}

# Safe file operation with backup
copy_file_safe() {
    local source="$1"
    local destination="$2"
    local backup="${3:-true}"
    
    if [ -z "$source" ] || [ -z "$destination" ]; then
        log_error "Source and destination must be specified"
        return 1
    fi
    
    if [ ! -f "$source" ]; then
        log_error "Source file does not exist: $source"
        return 1
    fi
    
    # Create backup if destination exists and backup is requested
    if [ "$backup" == "true" ] && [ -f "$destination" ]; then
        local backup_file="${destination}.backup.$(date +%Y%m%d_%H%M%S)"
        log_debug "Creating backup: $backup_file"
        if ! cp "$destination" "$backup_file" 2>/dev/null; then
            sudo cp "$destination" "$backup_file" 2>/dev/null || {
                log_warning "Failed to create backup of $destination"
            }
        fi
    fi
    
    # Copy file
    log_debug "Copying $source to $destination"
    if ! cp "$source" "$destination" 2>/dev/null; then
        if ! sudo cp "$source" "$destination" 2>/dev/null; then
            log_error "Failed to copy $source to $destination"
            return 1
        fi
    fi
    
    return 0
}

# Add user to group safely
add_user_to_group() {
    local username="${1:-$USER}"
    local group="$2"
    
    if [ -z "$group" ]; then
        log_error "Group name must be specified"
        return 1
    fi
    
    # Check if group exists
    if ! getent group "$group" >/dev/null; then
        log_error "Group does not exist: $group"
        return 1
    fi
    
    # Check if user is already in group
    if groups "$username" 2>/dev/null | grep -q "\b$group\b"; then
        log_debug "User $username is already in group $group"
        return 0
    fi
    
    # Add user to group
    log_info "Adding user $username to group $group"
    if sudo usermod -aG "$group" "$username"; then
        log_success "User $username added to group $group"
        log_info "Note: Group membership will take effect after logout/login or 'newgrp $group'"
        return 0
    else
        log_error "Failed to add user $username to group $group"
        return 1
    fi
}

# =============================================================================
# SERVICE UTILITIES
# =============================================================================

# Wait for service to be ready
wait_for_service() {
    local service_name="$1"
    local max_wait="${2:-60}"
    local check_interval="${3:-5}"
    
    log_info "Waiting for service $service_name to be ready (max ${max_wait}s)"
    
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        if systemctl is-active --quiet "$service_name" 2>/dev/null; then
            log_success "Service $service_name is ready"
            return 0
        fi
        
        log_debug "Service $service_name not ready, waiting ${check_interval}s..."
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
    done
    
    log_error "Service $service_name failed to become ready within ${max_wait}s"
    return 1
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# =============================================================================
# VALIDATION UTILITIES
# =============================================================================

# Validate URL accessibility
validate_url() {
    local url="$1"
    local timeout="${2:-10}"
    local max_retries="${3:-3}"
    
    if [ -z "$url" ]; then
        log_error "URL not specified"
        return 1
    fi
    
    log_debug "Validating URL: $url"
    
    local retry=0
    while [ $retry -lt $max_retries ]; do
        if curl -f -s --connect-timeout "$timeout" --max-time "$timeout" "$url" >/dev/null 2>&1; then
            log_debug "URL $url is accessible"
            return 0
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $max_retries ]; then
            log_debug "URL check failed, retrying (attempt $((retry + 1))/$max_retries)"
            sleep 2
        fi
    done
    
    log_debug "URL $url is not accessible after $max_retries attempts"
    return 1
}

# Validate environment variable
validate_env_var() {
    local var_name="$1"
    local var_value="${!var_name}"
    local is_required="${2:-false}"
    local pattern="${3:-}"
    
    if [ -z "$var_value" ]; then
        if [ "$is_required" == "true" ]; then
            log_error "Required environment variable $var_name is not set"
            return 1
        else
            log_debug "Optional environment variable $var_name is not set"
            return 0
        fi
    fi
    
    # Check pattern if specified
    if [ -n "$pattern" ]; then
        if [[ "$var_value" =~ $pattern ]]; then
            log_debug "Environment variable $var_name matches required pattern"
        else
            log_warning "Environment variable $var_name does not match expected pattern"
            return 1
        fi
    fi
    
    return 0
}

# =============================================================================
# ERROR HANDLING
# =============================================================================

# Enhanced error handling with context
exit_with_help() {
    local error_message="$1"
    local help_text="$2"
    local cleanup_function="${3:-}"
    
    echo "" >&2
    log_error "$error_message"
    echo "" >&2
    
    if [ -n "$help_text" ]; then
        echo -e "${YELLOW}💡 Helpful guidance:${NC}" >&2
        echo "$help_text" >&2
        echo "" >&2
    fi
    
    echo -e "${YELLOW}📚 For more help:${NC}" >&2
    echo "  - Check the deployment documentation: DIGITALOCEAN_DEPLOYMENT.md" >&2
    echo "  - Review environment setup: .env.example or .env.production.example" >&2
    echo "  - Verify prerequisites are installed (Docker, Node.js, etc.)" >&2
    echo "  - Check logs in application directory" >&2
    echo "" >&2
    
    # Run cleanup function if specified
    if [ -n "$cleanup_function" ] && command_exists "$cleanup_function"; then
        log_info "Running cleanup: $cleanup_function"
        "$cleanup_function" || true
    fi
    
    exit 1
}

# =============================================================================
# DOCKER UTILITIES
# =============================================================================

# Check Docker availability and health
check_docker() {
    log_debug "Checking Docker availability"
    
    if ! command_exists docker; then
        return 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        log_debug "Docker daemon not accessible"
        return 1
    fi
    
    # Check if Docker Compose is available
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        log_debug "Docker Compose not available"
        return 1
    fi
    
    return 0
}

# Wait for Docker service
wait_for_docker() {
    local max_wait="${1:-30}"
    local check_interval="${2:-5}"
    
    log_info "Waiting for Docker service to be ready"
    
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        if check_docker; then
            log_success "Docker service is ready"
            return 0
        fi
        
        log_debug "Docker not ready, waiting ${check_interval}s..."
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
    done
    
    log_error "Docker service failed to become ready within ${max_wait}s"
    return 1
}

# =============================================================================
# INITIALIZATION
# =============================================================================

# Initialize deployment utilities
init_deployment_utils() {
    # Set up error handling
    set -e
    set -o pipefail
    
    # Export commonly used variables
    export USER="${USER:-$(whoami)}"
    export HOME="${HOME:-$(eval echo ~$USER)}"
    
    log_debug "Deployment utilities initialized"
}

# Auto-initialize when sourced
init_deployment_utils

log_debug "Deployment utilities library loaded successfully"