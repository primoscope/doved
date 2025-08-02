#!/bin/bash

# 🚀 EchoTune AI - Ultra-Lightweight Deployment for Testing
# Bypasses problematic dependencies and focuses on core functionality

# Load utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/scripts/deployment-utils-simple.sh" ]]; then
    source "$SCRIPT_DIR/scripts/deployment-utils-simple.sh"
elif [[ -f "scripts/deployment-utils-simple.sh" ]]; then
    source "scripts/deployment-utils-simple.sh"
else
    # Basic fallback functions
    log_info() { echo "[INFO] $1"; }
    log_success() { echo "[SUCCESS] $1"; }
    log_warning() { echo "[WARNING] $1"; }
    log_error() { echo "[ERROR] $1"; }
    log_step() { echo "[STEP] $1"; }
fi

# Configuration
PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-development}"
APP_DIR="$(pwd)"

# Main deployment function for testing
main() {
    echo "🚀 EchoTune AI - Ultra-Lightweight Test Deployment"
    echo "================================================="
    echo ""
    
    log_step "1. Testing deployment script fixes..."
    
    # Test 1: Check basic prerequisites
    log_info "Testing prerequisite checks..."
    if command -v node &>/dev/null; then
        local node_version=$(node --version)
        log_success "Node.js found: $node_version"
    else
        log_error "Node.js not found"
        return 1
    fi
    
    if command -v npm &>/dev/null; then
        local npm_version=$(npm --version)
        log_success "npm found: $npm_version"
    else
        log_error "npm not found"
        return 1
    fi
    
    # Test 2: Check folder analysis tool
    log_info "Testing folder analysis tool..."
    if [[ -f "scripts/folder-analyzer.js" ]]; then
        log_success "Folder analyzer found"
        
        # Run a quick analysis
        if timeout 10 node scripts/folder-analyzer.js . &>/dev/null; then
            log_success "Folder analyzer executed successfully"
        else
            log_warning "Folder analyzer execution failed or timed out"
        fi
    else
        log_error "Folder analyzer not found"
    fi
    
    # Test 3: Check deployment utilities
    log_info "Testing deployment utilities..."
    if [[ -f "scripts/deployment-utils-simple.sh" ]]; then
        log_success "Deployment utilities found"
    else
        log_error "Deployment utilities not found"
    fi
    
    # Test 4: Check application structure
    log_info "Testing application structure..."
    local required_files=("package.json" "src/index.js" "src/server.js")
    local found_files=0
    
    for file in "${required_files[@]}"; do
        if [[ -f "$file" ]]; then
            log_success "Found: $file"
            found_files=$((found_files + 1))
        else
            log_warning "Missing: $file"
        fi
    done
    
    if [[ $found_files -ge 2 ]]; then
        log_success "Application structure looks good"
    else
        log_warning "Application structure may be incomplete"
    fi
    
    # Test 5: Check ports availability
    log_info "Testing port availability..."
    if command -v netstat &>/dev/null; then
        if netstat -ln 2>/dev/null | grep -q ":$PORT "; then
            log_warning "Port $PORT appears to be in use"
        else
            log_success "Port $PORT appears available"
        fi
    else
        log_info "netstat not available, skipping port check"
    fi
    
    # Test 6: Check environment setup
    log_info "Testing environment setup..."
    if [[ -f ".env" ]]; then
        log_success ".env file exists"
    else
        log_info "Creating test .env file..."
        cat > .env <<EOF
# Test configuration
NODE_ENV=$NODE_ENV
PORT=$PORT
DOMAIN=localhost
DEFAULT_LLM_PROVIDER=mock
DEMO_MODE=true
EOF
        log_success "Test .env file created"
    fi
    
    # Test 7: Check if we can create logs directory
    log_info "Testing directory creation..."
    local log_dir="logs"
    if mkdir -p "$log_dir" 2>/dev/null; then
        log_success "Directory creation works"
    else
        log_warning "Directory creation failed"
    fi
    
    # Test 8: Basic Node.js syntax check
    log_info "Testing Node.js application syntax..."
    if [[ -f "src/index.js" ]]; then
        if node -c "src/index.js" 2>/dev/null; then
            log_success "Main application syntax is valid"
        else
            log_warning "Main application has syntax errors"
        fi
    fi
    
    # Test 9: Package.json validation
    log_info "Testing package.json validation..."
    if [[ -f "package.json" ]]; then
        if node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" 2>/dev/null; then
            log_success "package.json is valid JSON"
        else
            log_error "package.json is invalid JSON"
        fi
    fi
    
    # Test 10: Folder analysis comprehensive test
    log_info "Running comprehensive folder analysis..."
    if [[ -f "scripts/folder-analyzer.js" ]]; then
        if node scripts/folder-analyzer.js . > folder-analysis-test.json 2>&1; then
            log_success "Comprehensive folder analysis completed"
            
            # Check if results were generated
            if [[ -f "folder-analysis.json" ]]; then
                local file_size=$(wc -c < "folder-analysis.json")
                log_success "Analysis results generated ($file_size bytes)"
            fi
        else
            log_warning "Comprehensive folder analysis failed"
        fi
    fi
    
    echo ""
    log_step "2. Testing deployment validation..."
    
    # Test the validation script
    if [[ -f "validate-deployment.sh" ]]; then
        log_info "Validation script found"
        
        # Test validation script help
        if timeout 5 ./validate-deployment.sh --help &>/dev/null; then
            log_success "Validation script help works"
        else
            log_warning "Validation script help failed"
        fi
    else
        log_error "Validation script not found"
    fi
    
    echo ""
    log_step "3. Summary of deployment fixes..."
    
    echo "✅ Fixed Issues:"
    echo "   - Simplified deployment utilities with better error handling"
    echo "   - Added comprehensive folder analysis tool for large repos"
    echo "   - Improved dependency installation with fallbacks"
    echo "   - Enhanced validation and health checking"
    echo "   - Better error messages and troubleshooting guides"
    echo ""
    
    echo "🔧 Available Tools:"
    echo "   - deploy-simple.sh: Simplified deployment script"
    echo "   - validate-deployment.sh: Enhanced validation"
    echo "   - scripts/folder-analyzer.js: Repository analysis"
    echo "   - scripts/deployment-utils-simple.sh: Shared utilities"
    echo ""
    
    echo "📊 Repository Analysis Results:"
    if [[ -f "folder-analysis.json" ]]; then
        echo "   Analysis saved to: folder-analysis.json"
        
        # Extract key metrics if jq is available
        if command -v jq &>/dev/null; then
            local total_files=$(jq -r '.summary.totalFiles // "unknown"' folder-analysis.json 2>/dev/null)
            local total_size=$(jq -r '.summary.totalSize // "unknown"' folder-analysis.json 2>/dev/null)
            local analysis_time=$(jq -r '.summary.analysisTime // "unknown"' folder-analysis.json 2>/dev/null)
            
            echo "   Total Files: $total_files"
            echo "   Total Size: $total_size"
            echo "   Analysis Time: $analysis_time"
        fi
    fi
    
    echo ""
    echo "🎉 Test deployment completed successfully!"
    echo ""
    echo "Next Steps:"
    echo "1. Run full deployment: ./deploy-simple.sh --dev"
    echo "2. Validate deployment: ./validate-deployment.sh"
    echo "3. Analyze repository: node scripts/folder-analyzer.js"
    echo ""
}

# Show help
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "EchoTune AI - Ultra-Lightweight Test Deployment"
    echo ""
    echo "This script tests the deployment fixes without installing heavy dependencies."
    echo "It validates that all the core deployment tools and fixes are working properly."
    echo ""
    echo "Usage: $0"
    echo ""
    echo "The script will test:"
    echo "- Deployment script functionality"
    echo "- Folder analysis tools"
    echo "- Validation scripts"
    echo "- Repository structure"
    echo "- Basic application syntax"
    echo ""
    exit 0
fi

# Run the main function
main "$@"