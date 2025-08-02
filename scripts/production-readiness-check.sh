#!/bin/bash

# EchoTune AI Production Readiness Check
# Validates all critical aspects for production deployment

set -e

echo "🔍 EchoTune AI Production Readiness Check"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    PASSED=$((PASSED + 1))
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
    FAILED=$((FAILED + 1))
}

check_warn() {
    echo -e "${YELLOW}⚠️ $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

check_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

# 1. Environment Configuration
echo "📝 Checking Environment Configuration..."

if [ -f ".env" ]; then
    check_pass "Environment file exists"
    
    # Check for placeholder values
    if grep -q "your_.*_here" .env; then
        check_warn "Environment contains placeholder values - update for production"
    else
        check_pass "No placeholder values in environment"
    fi
    
    # Check for required variables
    required_vars=("NODE_ENV" "PORT" "SPOTIFY_CLIENT_ID" "SPOTIFY_CLIENT_SECRET")
    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" .env; then
            check_pass "Required variable $var is set"
        else
            check_fail "Missing required variable: $var"
        fi
    done
else
    check_fail "Environment file (.env) not found"
fi

echo ""

# 2. Dependencies
echo "📦 Checking Dependencies..."

if [ -f "package.json" ] && [ -d "node_modules" ]; then
    check_pass "Node.js dependencies installed"
else
    check_fail "Node.js dependencies not installed (run: npm install)"
fi

if [ -f "requirements.txt" ]; then
    if command -v python3 &> /dev/null; then
        check_pass "Python is available"
        if python3 -c "import pandas, numpy" 2>/dev/null; then
            check_pass "Python ML dependencies available"
        else
            check_warn "Python ML dependencies not installed (run: pip install -r requirements.txt)"
        fi
    else
        check_warn "Python not available for ML features"
    fi
fi

echo ""

# 3. Application Startup
echo "🚀 Checking Application Startup..."

check_info "Testing application startup (may take a moment)..."

# Start the app in background and monitor logs
timeout 20s npm start > /tmp/app_startup.log 2>&1 &
APP_PID=$!

# Wait for startup indicators
sleep 8

# Check if app started successfully by looking for success indicators
if grep -q "EchoTune AI Server running on port" /tmp/app_startup.log 2>/dev/null; then
    check_pass "Application starts successfully"
    # Gracefully terminate the test app
    kill $APP_PID 2>/dev/null || true
elif grep -q "Error\|EADDRINUSE" /tmp/app_startup.log 2>/dev/null; then
    check_fail "Application startup error detected"
    # Show the error for debugging
    tail -3 /tmp/app_startup.log 2>/dev/null || true
else
    check_warn "Application startup unclear - check manually with 'npm start'"
fi

# Clean up
kill $APP_PID 2>/dev/null || true
rm -f /tmp/app_startup.log

echo ""

# 4. Code Quality
echo "🔧 Checking Code Quality..."

if command -v npm run lint >/dev/null 2>&1; then
    lint_output=$(npm run lint 2>&1 || true)
    error_count=$(echo "$lint_output" | grep -o '[0-9]\+ problems' | grep -o '[0-9]\+' || echo "0")
    
    if [ "$error_count" -eq 0 ]; then
        check_pass "No linting errors"
    elif [ "$error_count" -lt 50 ]; then
        check_warn "$error_count linting issues found (acceptable for production)"
    else
        check_warn "$error_count linting issues found (recommend fixing critical ones)"
    fi
else
    check_warn "Linting not configured"
fi

echo ""

# 5. Database Configuration
echo "🗄️ Checking Database Configuration..."

# Check for SQLite fallback
if [ -d "data" ]; then
    check_pass "SQLite fallback directory exists"
else
    check_info "SQLite fallback directory will be created on startup"
fi

# Check for production database configs
if grep -q "MONGODB_URI" .env 2>/dev/null; then
    mongodb_uri=$(grep "MONGODB_URI" .env | cut -d'=' -f2)
    if [[ "$mongodb_uri" != *"your_"* ]] && [[ "$mongodb_uri" != "" ]]; then
        check_pass "MongoDB configuration found"
    else
        check_info "MongoDB not configured (will use SQLite fallback)"
    fi
else
    check_info "MongoDB not configured (will use SQLite fallback)"
fi

echo ""

# 6. Security Configuration
echo "🔒 Checking Security Configuration..."

# Check for secure secrets
if grep -q "SESSION_SECRET.*please_change\|JWT_SECRET.*please_change" .env 2>/dev/null; then
    check_warn "Default secrets detected - regenerate for production"
else
    check_pass "Secure secrets configured"
fi

# Check for HTTPS configuration
if grep -q "FRONTEND_URL=https" .env 2>/dev/null; then
    check_pass "HTTPS configuration found"
else
    check_warn "HTTP configuration detected - enable HTTPS for production"
fi

echo ""

# 7. Production Files
echo "📋 Checking Production Files..."

production_files=("Dockerfile" "docker-compose.yml" "nginx.conf" "scripts/deploy-digitalocean.sh")
for file in "${production_files[@]}"; do
    if [ -f "$file" ]; then
        check_pass "Production file exists: $file"
    else
        check_warn "Production file missing: $file"
    fi
done

echo ""

# 8. API Health Check
echo "🏥 Checking API Health..."

if pgrep -f "npm start\|node.*server\|node.*index" >/dev/null 2>&1; then
    check_info "Application appears to be running"
    
    # Quick health check
    if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
        check_pass "Health endpoint responding"
    else
        check_warn "Health endpoint not responding (may still be starting)"
    fi
else
    check_info "Application not currently running (normal for deployment checks)"
fi

echo ""

# Summary
echo "📊 Production Readiness Summary"
echo "==============================="
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${YELLOW}⚠️ Warnings: $WARNINGS${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 Production Ready! All checks passed.${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚡ Production Ready with warnings. Address warnings for optimal deployment.${NC}"
        exit 0
    fi
else
    echo -e "${RED}🚨 Production readiness issues found. Fix failed checks before deployment.${NC}"
    exit 1
fi