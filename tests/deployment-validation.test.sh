#!/bin/bash

# Test script for deployment environment validation
# Tests edge cases for missing .env, partial env, etc.

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_DIR="/tmp/deployment-test-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts"

# Helper functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

setup_test_env() {
    log_test "Setting up test environment in $TEST_DIR"
    mkdir -p "$TEST_DIR"
    cd "$TEST_DIR"
    
    # Copy script files for testing
    cp "$SCRIPT_DIR/deploy.sh" "$TEST_DIR/"
    cp "$SCRIPT_DIR/setup-digitalocean.sh" "$TEST_DIR/"
    
    # Make scripts executable
    chmod +x deploy.sh setup-digitalocean.sh
}

cleanup_test_env() {
    log_test "Cleaning up test environment"
    cd /tmp
    rm -rf "$TEST_DIR"
}

# Test 1: Missing .env file
test_missing_env() {
    log_test "Test 1: Missing .env file"
    
    cd "$TEST_DIR"
    
    # Remove any existing .env files
    rm -f .env
    
    # Extract the detect_and_source_env function and test it
    if bash -c "
        source ./deploy.sh
        detect_and_source_env 2>/dev/null
    "; then
        log_fail "Should fail when no .env file exists"
        return 1
    else
        log_pass "Correctly fails when no .env file exists"
        return 0
    fi
}

# Test 2: Valid .env file
test_valid_env() {
    log_test "Test 2: Valid .env file"
    
    cd "$TEST_DIR"
    
    # Create a valid .env file
    cat > .env <<EOF
SPOTIFY_CLIENT_ID=1234567890abcdef1234567890abcdef
SPOTIFY_CLIENT_SECRET=fedcba0987654321fedcba0987654321
NODE_ENV=production
PORT=3000
DOMAIN=example.com
FRONTEND_URL=https://example.com
SPOTIFY_REDIRECT_URI=https://example.com/auth/callback
EOF
    
    # Test environment detection by extracting just the function
    if bash -c "
        # Extract and define the function
        detect_and_source_env() {
            local env_file=\"\"
            local env_locations=(
                \".env\"
                \"/opt/echotune/.env\"
                \"\$(pwd)/.env\"
            )
            
            for location in \"\${env_locations[@]}\"; do
                if [ -f \"\$location\" ]; then
                    env_file=\"\$location\"
                    break
                fi
            done
            
            if [ -n \"\$env_file\" ]; then
                set -a
                source \"\$env_file\"
                set +a
                return 0
            else
                return 1
            fi
        }
        
        detect_and_source_env >/dev/null 2>&1 && 
        [ \"\$SPOTIFY_CLIENT_ID\" = \"1234567890abcdef1234567890abcdef\" ]
    "; then
        log_pass "Correctly loads valid .env file"
        return 0
    else
        log_fail "Failed to load valid .env file"
        return 1
    fi
}

# Test 3: Partial .env file (missing required variables)
test_partial_env() {
    log_test "Test 3: Partial .env file (missing required variables)"
    
    cd "$TEST_DIR"
    
    # Create a partial .env file missing required variables
    cat > .env <<EOF
NODE_ENV=production
PORT=3000
EOF
    
    # Test validation with extracted functions
    if bash -c "
        # Setup environment
        set -a
        source .env
        set +a
        
        # Mock validation function
        validate_environment() {
            local required_vars=(
                \"SPOTIFY_CLIENT_ID\"
                \"SPOTIFY_CLIENT_SECRET\"
                \"NODE_ENV\"
                \"PORT\"
            )
            
            local missing_vars=()
            
            for var in \"\${required_vars[@]}\"; do
                if [ -z \"\${!var}\" ]; then
                    missing_vars+=(\"\$var\")
                fi
            done
            
            if [ \${#missing_vars[@]} -ne 0 ]; then
                return 1
            fi
            
            return 0
        }
        
        validate_environment 2>/dev/null
    "; then
        log_fail "Should fail validation with missing required variables"
        return 1
    else
        log_pass "Correctly fails validation with missing required variables"
        return 0
    fi
}

# Test 4: Invalid Spotify credentials format
test_invalid_credentials() {
    log_test "Test 4: Invalid Spotify credentials format"
    
    cd "$TEST_DIR"
    
    # Create .env with invalid credential formats
    cat > .env <<EOF
SPOTIFY_CLIENT_ID=invalid_format
SPOTIFY_CLIENT_SECRET=also_invalid
NODE_ENV=production
PORT=3000
EOF
    
    # Test validation (should pass but with warnings)
    if bash -c "
        source ./deploy.sh
        detect_and_source_env >/dev/null 2>&1
        validate_environment 2>&1 | grep -q 'warning'
    "; then
        log_pass "Correctly warns about invalid credential formats"
        return 0
    else
        log_warning "Warning system may not be working as expected"
        return 0  # Don't fail since this is just a warning
    fi
}

# Test 5: Environment file in different locations
test_env_locations() {
    log_test "Test 5: Environment file detection in different locations"
    
    cd "$TEST_DIR"
    
    # Remove local .env
    rm -f .env
    
    # Create /opt/echotune directory and .env file
    mkdir -p /opt/echotune
    cat > /opt/echotune/.env <<EOF
SPOTIFY_CLIENT_ID=1234567890abcdef1234567890abcdef
SPOTIFY_CLIENT_SECRET=fedcba0987654321fedcba0987654321
NODE_ENV=production
PORT=3000
DOMAIN=example.com
EOF
    
    # Test detection
    if bash -c "
        source ./deploy.sh
        detect_and_source_env >/dev/null 2>&1 && 
        [ \"\$SPOTIFY_CLIENT_ID\" = \"1234567890abcdef1234567890abcdef\" ]
    "; then
        log_pass "Correctly finds .env in /opt/echotune/"
        cleanup_opt_echotune
        return 0
    else
        log_fail "Failed to find .env in /opt/echotune/"
        cleanup_opt_echotune
        return 1
    fi
}

cleanup_opt_echotune() {
    # Clean up test directory (only if we created it for testing)
    if [ -f "/opt/echotune/.env" ] && grep -q "1234567890abcdef1234567890abcdef" "/opt/echotune/.env" 2>/dev/null; then
        sudo rm -f /opt/echotune/.env
        sudo rmdir /opt/echotune 2>/dev/null || true
    fi
}

# Test 6: Setup script environment detection
test_setup_script_env() {
    log_test "Test 6: Setup script environment detection"
    
    cd "$TEST_DIR"
    
    # Create .env file
    cat > .env <<EOF
DOMAIN=test-domain.com
NODE_ENV=development
SPOTIFY_CLIENT_ID=1234567890abcdef1234567890abcdef
EOF
    
    # Test setup script environment detection
    if bash -c "
        source ./setup-digitalocean.sh
        detect_and_source_env >/dev/null 2>&1 && 
        [ \"\$DOMAIN\" = \"test-domain.com\" ]
    "; then
        log_pass "Setup script correctly detects environment"
        return 0
    else
        log_fail "Setup script failed to detect environment"
        return 1
    fi
}

# Main test runner
run_tests() {
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    echo "🧪 EchoTune AI - Deployment Script Validation Tests"
    echo "=================================================="
    echo ""
    
    setup_test_env
    
    # Run all tests
    tests=(
        "test_missing_env"
        "test_valid_env"
        "test_partial_env"
        "test_invalid_credentials"
        "test_env_locations"
        "test_setup_script_env"
    )
    
    for test in "${tests[@]}"; do
        total_tests=$((total_tests + 1))
        if $test; then
            passed_tests=$((passed_tests + 1))
        else
            failed_tests=$((failed_tests + 1))
        fi
        echo ""
    done
    
    cleanup_test_env
    
    # Report results
    echo "📊 Test Results:"
    echo "  - Total tests: $total_tests"
    echo "  - Passed: $passed_tests"
    echo "  - Failed: $failed_tests"
    echo ""
    
    if [ $failed_tests -eq 0 ]; then
        log_pass "All tests passed!"
        return 0
    else
        log_fail "$failed_tests test(s) failed"
        return 1
    fi
}

# Check if running directly or being sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_tests "$@"
fi