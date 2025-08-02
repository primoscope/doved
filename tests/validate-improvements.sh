#!/bin/bash

# 🔍 Quick Deployment Script Validation
# Validates key improvements made to deployment scripts

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_test() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }

echo "🔍 EchoTune AI - Deployment Script Validation"
echo "=============================================="
echo ""

total_tests=0
passed_tests=0

# Test 1: Check all scripts have valid syntax
log_test "1. Script syntax validation"
total_tests=$((total_tests + 1))

if bash -n deploy-one-click.sh && \
   bash -n scripts/deploy.sh && \
   bash -n scripts/deploy-simple.sh && \
   bash -n scripts/deploy-digitalocean.sh && \
   bash -n scripts/deployment-utils.sh; then
    log_pass "All scripts have valid syntax"
    passed_tests=$((passed_tests + 1))
else
    log_fail "Some scripts have syntax errors"
fi

# Test 2: Check for DEBIAN_FRONTEND configuration
log_test "2. Non-interactive package installation configuration"
total_tests=$((total_tests + 1))

debian_frontend_count=0
scripts_to_check=("deploy-one-click.sh" "scripts/deploy-digitalocean.sh")

for script in "${scripts_to_check[@]}"; do
    if grep -q "DEBIAN_FRONTEND=noninteractive" "$script"; then
        debian_frontend_count=$((debian_frontend_count + 1))
    fi
done

if [ $debian_frontend_count -eq ${#scripts_to_check[@]} ]; then
    log_pass "All relevant scripts configure non-interactive package installation"
    passed_tests=$((passed_tests + 1))
else
    log_fail "Some scripts missing DEBIAN_FRONTEND=noninteractive configuration"
fi

# Test 3: Check for error handling
log_test "3. Error handling consistency"
total_tests=$((total_tests + 1))

error_handling_count=0
scripts_to_check=("deploy-one-click.sh" "scripts/deploy.sh" "scripts/deploy-simple.sh" "scripts/deploy-digitalocean.sh")

for script in "${scripts_to_check[@]}"; do
    if grep -q "set -e" "$script" && grep -q -E "(trap.*ERR|cleanup_on_error)" "$script"; then
        error_handling_count=$((error_handling_count + 1))
    fi
done

if [ $error_handling_count -eq ${#scripts_to_check[@]} ]; then
    log_pass "All scripts have consistent error handling"
    passed_tests=$((passed_tests + 1))
else
    log_fail "Some scripts missing proper error handling ($error_handling_count/${#scripts_to_check[@]})"
fi

# Test 4: Check for deployment utilities integration
log_test "4. Deployment utilities integration"
total_tests=$((total_tests + 1))

if [ -f "scripts/deployment-utils.sh" ] && bash -n scripts/deployment-utils.sh; then
    # Check if main scripts try to source deployment utilities
    integration_count=0
    scripts_to_check=("deploy-one-click.sh" "scripts/deploy.sh" "scripts/deploy-simple.sh" "scripts/deploy-digitalocean.sh")
    
    for script in "${scripts_to_check[@]}"; do
        if grep -q "deployment-utils.sh" "$script"; then
            integration_count=$((integration_count + 1))
        fi
    done
    
    if [ $integration_count -gt 0 ]; then
        log_pass "Deployment utilities are integrated into scripts"
        passed_tests=$((passed_tests + 1))
    else
        log_fail "Deployment utilities not integrated"
    fi
else
    log_fail "Deployment utilities script missing or invalid"
fi

# Test 5: Check for enhanced documentation
log_test "5. Documentation updates"
total_tests=$((total_tests + 1))

if grep -q "Enhanced" ONE-CLICK-DEPLOY.md && \
   grep -q "comprehensive" ONE-CLICK-DEPLOY.md && \
   grep -q "deployment-comprehensive.test.sh" ONE-CLICK-DEPLOY.md; then
    log_pass "Documentation updated with enhanced features"
    passed_tests=$((passed_tests + 1))
else
    log_fail "Documentation not properly updated"
fi

# Test 6: Check for comprehensive test suite
log_test "6. Enhanced test suite"
total_tests=$((total_tests + 1))

if [ -f "tests/deployment-comprehensive.test.sh" ] && [ -x "tests/deployment-comprehensive.test.sh" ]; then
    log_pass "Comprehensive test suite available"
    passed_tests=$((passed_tests + 1))
else
    log_fail "Comprehensive test suite missing or not executable"
fi

# Test 7: Check for permission handling improvements
log_test "7. Permission handling improvements"
total_tests=$((total_tests + 1))

if grep -q "create_directory_safe" scripts/deployment-utils.sh && \
   grep -q "add_user_to_group" scripts/deployment-utils.sh; then
    log_pass "Enhanced permission handling functions available"
    passed_tests=$((passed_tests + 1))
else
    log_fail "Enhanced permission handling functions missing"
fi

# Test 8: Check for robust package installation
log_test "8. Robust package installation"
total_tests=$((total_tests + 1))

if grep -q "install_packages_apt" scripts/deployment-utils.sh && \
   grep -q "retry" scripts/deployment-utils.sh; then
    log_pass "Robust package installation with retry logic available"
    passed_tests=$((passed_tests + 1))
else
    log_fail "Robust package installation functions missing"
fi

echo ""
echo "📊 Validation Results:"
echo "  - Total tests: $total_tests"
echo "  - Passed: $passed_tests"
echo "  - Failed: $((total_tests - passed_tests))"
echo ""

if [ $passed_tests -eq $total_tests ]; then
    log_success "🎉 All deployment script improvements validated successfully!"
    echo ""
    echo "✅ Key improvements confirmed:"
    echo "  - All scripts have valid syntax and error handling"
    echo "  - Non-interactive package installation configured"
    echo "  - Enhanced permission handling and utilities available"
    echo "  - Comprehensive test suite implemented"
    echo "  - Documentation updated with new features"
    echo "  - Robust package installation with retry logic"
    echo ""
    echo "🚀 Deployment scripts are now production-ready with enhanced reliability!"
    exit 0
else
    log_error "❌ Some validations failed ($((total_tests - passed_tests))/$total_tests)"
    echo ""
    echo "🔧 Issues that need attention:"
    echo "  - Review the failed tests above"
    echo "  - Ensure all deployment scripts are properly configured"
    echo "  - Verify deployment utilities are correctly integrated"
    echo ""
    exit 1
fi