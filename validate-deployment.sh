#!/bin/bash

# 🔍 EchoTune AI - Deployment Validation Script
# Quick validation to ensure deployment was successful

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DEFAULT_URL="http://localhost:3000"
TIMEOUT=10
MAX_RETRIES=5

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if URL is provided as argument
URL="${1:-$DEFAULT_URL}"

log_info "Validating EchoTune AI deployment at $URL"

# Function to check HTTP endpoint
check_endpoint() {
    local endpoint="$1"
    local description="$2"
    local url="$URL$endpoint"
    
    log_info "Checking $description..."
    
    if curl -f -s --connect-timeout $TIMEOUT --max-time $TIMEOUT "$url" > /dev/null 2>&1; then
        log_success "$description is accessible"
        return 0
    else
        log_error "$description is not accessible at $url"
        return 1
    fi
}

# Function to check HTTP endpoint with response validation
check_endpoint_with_response() {
    local endpoint="$1"
    local description="$2"
    local expected_content="$3"
    local url="$URL$endpoint"
    
    log_info "Checking $description..."
    
    local response
    if response=$(curl -f -s --connect-timeout $TIMEOUT --max-time $TIMEOUT "$url" 2>/dev/null); then
        if [[ "$response" == *"$expected_content"* ]]; then
            log_success "$description is working correctly"
            return 0
        else
            log_warning "$description is accessible but response doesn't contain expected content"
            return 1
        fi
    else
        log_error "$description is not accessible at $url"
        return 1
    fi
}

# Function to check JSON endpoint
check_json_endpoint() {
    local endpoint="$1"
    local description="$2"
    local url="$URL$endpoint"
    
    log_info "Checking $description..."
    
    local response
    if response=$(curl -f -s --connect-timeout $TIMEOUT --max-time $TIMEOUT "$url" 2>/dev/null); then
        if echo "$response" | jq . > /dev/null 2>&1; then
            log_success "$description returned valid JSON"
            return 0
        else
            log_warning "$description is accessible but didn't return valid JSON"
            echo "Response: $response"
            return 1
        fi
    else
        log_error "$description is not accessible at $url"
        return 1
    fi
}

# Main validation function
main() {
    echo "🔍 EchoTune AI Deployment Validation"
    echo "===================================="
    echo ""
    
    local passed=0
    local total=0
    
    # Wait for application to be ready
    log_info "Waiting for application to be ready..."
    local retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        if curl -f -s --connect-timeout 2 --max-time 5 "$URL" > /dev/null 2>&1; then
            log_success "Application is responding"
            break
        fi
        retry=$((retry + 1))
        if [ $retry -lt $MAX_RETRIES ]; then
            log_info "Attempt $retry/$MAX_RETRIES - waiting for application..."
            sleep 5
        fi
    done
    
    if [ $retry -eq $MAX_RETRIES ]; then
        log_error "Application is not responding after $MAX_RETRIES attempts"
        log_error "Please check if the application is running and accessible"
        exit 1
    fi
    
    echo ""
    log_info "Running comprehensive validation checks..."
    echo ""
    
    # Core application endpoints
    total=$((total + 1))
    if check_endpoint_with_response "/" "Main Application" "EchoTune AI"; then
        passed=$((passed + 1))
    fi
    
    total=$((total + 1))
    if check_json_endpoint "/health" "Health Check API"; then
        passed=$((passed + 1))
    fi
    
    total=$((total + 1))
    if check_endpoint "/api/chat/providers" "Chat Providers API"; then
        passed=$((passed + 1))
    fi
    
    # Static assets
    total=$((total + 1))
    if check_endpoint "/src/style.css" "CSS Assets"; then
        passed=$((passed + 1))
    fi
    
    total=$((total + 1))
    if check_endpoint "/src/app.js" "JavaScript Assets"; then
        passed=$((passed + 1))
    fi
    
    # Feature endpoints
    total=$((total + 1))
    if check_endpoint_with_response "/chat" "Chat Interface" "Music Assistant"; then
        passed=$((passed + 1))
    fi
    
    # Optional endpoints (won't fail validation if missing)
    log_info "Checking optional features..."
    
    if check_endpoint "/dashboard" "Analytics Dashboard"; then
        log_success "Dashboard feature available"
    else
        log_warning "Dashboard feature not available (optional)"
    fi
    
    if check_endpoint "/profile" "User Profile"; then
        log_success "Profile feature available"  
    else
        log_warning "Profile feature not available (optional)"
    fi
    
    # Display results
    echo ""
    echo "📊 Validation Results"
    echo "===================="
    echo "Passed: $passed/$total core checks"
    
    if [ $passed -eq $total ]; then
        echo ""
        log_success "🎉 All core validation checks passed!"
        echo ""
        echo "✅ Your EchoTune AI deployment is working correctly"
        echo "🌐 Access your application at: $URL"
        echo ""
        echo "🚀 Quick Links:"
        echo "   - Main App: $URL"
        echo "   - Health Check: $URL/health"
        echo "   - Chat Interface: $URL/chat"
        echo ""
        echo "🎵 Enjoy your AI-powered music discovery platform!"
        exit 0
    else
        echo ""
        log_error "❌ Some validation checks failed ($passed/$total passed)"
        echo ""
        echo "🔧 Troubleshooting suggestions:"
        echo "   1. Check if all application services are running"
        echo "   2. Verify environment configuration"
        echo "   3. Check application logs for errors"
        echo "   4. Ensure all dependencies are installed"
        echo ""
        echo "💡 Common issues:"
        echo "   - Missing environment variables"
        echo "   - Port conflicts"
        echo "   - Incomplete dependency installation"
        echo "   - Network connectivity problems"
        exit 1
    fi
}

# Help function
show_help() {
    echo "EchoTune AI Deployment Validation Script"
    echo ""
    echo "Usage: $0 [URL]"
    echo ""
    echo "Arguments:"
    echo "  URL    Application URL to validate (default: http://localhost:3000)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Validate localhost deployment"
    echo "  $0 http://your-domain.com:3000        # Validate remote deployment"
    echo "  $0 https://app.ondigitalocean.app     # Validate DigitalOcean App Platform"
    echo ""
    echo "Exit codes:"
    echo "  0    All core validation checks passed"
    echo "  1    Some validation checks failed or application not accessible"
}

# Parse command line arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
    exit 0
fi

# Check if jq is available for JSON validation
if ! command -v jq &> /dev/null; then
    log_warning "jq not found - JSON validation will be limited"
    log_info "Install jq for better validation: apt install jq (Ubuntu) or brew install jq (macOS)"
fi

# Run main validation
main "$@"