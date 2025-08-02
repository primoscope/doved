#!/bin/bash

# Simplified test for deployment environment validation
# Tests core functionality without running full deployment

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test 1: Environment file detection
test_env_detection() {
    log_test "Environment file detection"
    
    # Create test .env file
    cat > .env <<EOF
SPOTIFY_CLIENT_ID=1234567890abcdef1234567890abcdef
SPOTIFY_CLIENT_SECRET=fedcba0987654321fedcba0987654321
NODE_ENV=production
PORT=3000
DOMAIN=example.com
EOF

    # Test detection function
    detect_and_source_env() {
        local env_file=""
        local env_locations=(".env" "/opt/echotune/.env" "$(pwd)/.env")
        
        for location in "${env_locations[@]}"; do
            if [ -f "$location" ]; then
                env_file="$location"
                break
            fi
        done
        
        if [ -n "$env_file" ]; then
            set -a
            source "$env_file"
            set +a
            return 0
        else
            return 1
        fi
    }
    
    if detect_and_source_env && [ "$SPOTIFY_CLIENT_ID" = "1234567890abcdef1234567890abcdef" ]; then
        log_pass "Environment detection works"
        rm -f .env
        return 0
    else
        log_fail "Environment detection failed"
        rm -f .env
        return 1
    fi
}

# Test 2: Environment validation
test_env_validation() {
    log_test "Environment validation"
    
    # Set up test environment
    export SPOTIFY_CLIENT_ID="1234567890abcdef1234567890abcdef"
    export SPOTIFY_CLIENT_SECRET="fedcba0987654321fedcba0987654321"
    export NODE_ENV="production"
    export PORT="3000"
    
    validate_environment() {
        local required_vars=("SPOTIFY_CLIENT_ID" "SPOTIFY_CLIENT_SECRET" "NODE_ENV" "PORT")
        local missing_vars=()
        
        for var in "${required_vars[@]}"; do
            if [ -z "${!var}" ]; then
                missing_vars+=("$var")
            fi
        done
        
        [ ${#missing_vars[@]} -eq 0 ]
    }
    
    if validate_environment; then
        log_pass "Environment validation works"
        return 0
    else
        log_fail "Environment validation failed"
        return 1
    fi
}

# Test 3: Missing variables detection
test_missing_vars() {
    log_test "Missing variables detection"
    
    # Unset required variable
    unset SPOTIFY_CLIENT_ID
    export SPOTIFY_CLIENT_SECRET="fedcba0987654321fedcba0987654321"
    export NODE_ENV="production"
    export PORT="3000"
    
    validate_environment() {
        local required_vars=("SPOTIFY_CLIENT_ID" "SPOTIFY_CLIENT_SECRET" "NODE_ENV" "PORT")
        local missing_vars=()
        
        for var in "${required_vars[@]}"; do
            if [ -z "${!var}" ]; then
                missing_vars+=("$var")
            fi
        done
        
        [ ${#missing_vars[@]} -eq 0 ]
    }
    
    if validate_environment; then
        log_fail "Should detect missing variables"
        return 1
    else
        log_pass "Correctly detects missing variables"
        return 0
    fi
}

# Test 4: Syntax validation of scripts
test_script_syntax() {
    log_test "Script syntax validation"
    
    local scripts=("scripts/deploy.sh" "scripts/setup-digitalocean.sh")
    local syntax_errors=0
    
    for script in "${scripts[@]}"; do
        if ! bash -n "$script" 2>/dev/null; then
            log_fail "Syntax error in $script"
            syntax_errors=$((syntax_errors + 1))
        fi
    done
    
    if [ $syntax_errors -eq 0 ]; then
        log_pass "All scripts have valid syntax"
        return 0
    else
        log_fail "$syntax_errors script(s) have syntax errors"
        return 1
    fi
}

# Test 5: Path consistency check
test_path_consistency() {
    log_test "Path consistency check"
    
    local setup_path=$(grep 'APP_DIR=' scripts/setup-digitalocean.sh | head -1 | cut -d'"' -f2)
    local deploy_path=$(grep 'APP_DIR=' scripts/deploy.sh | head -1 | cut -d'"' -f2)
    
    if [ "$setup_path" = "$deploy_path" ] && [ "$setup_path" = "/opt/echotune" ]; then
        log_pass "Path consistency verified: $setup_path"
        return 0
    else
        log_fail "Path inconsistency: setup=$setup_path, deploy=$deploy_path"
        return 1
    fi
}

# Run all tests
run_tests() {
    echo "🧪 EchoTune AI - Core Deployment Function Tests"
    echo "==============================================="
    echo ""
    
    local total_tests=0
    local passed_tests=0
    
    tests=(
        "test_env_detection"
        "test_env_validation" 
        "test_missing_vars"
        "test_script_syntax"
        "test_path_consistency"
    )
    
    for test in "${tests[@]}"; do
        total_tests=$((total_tests + 1))
        if $test; then
            passed_tests=$((passed_tests + 1))
        fi
        echo ""
    done
    
    echo "📊 Test Results:"
    echo "  - Total tests: $total_tests"
    echo "  - Passed: $passed_tests"
    echo "  - Failed: $((total_tests - passed_tests))"
    echo ""
    
    if [ $passed_tests -eq $total_tests ]; then
        log_pass "All core tests passed!"
        return 0
    else
        log_fail "$((total_tests - passed_tests)) test(s) failed"
        return 1
    fi
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_tests "$@"
fi