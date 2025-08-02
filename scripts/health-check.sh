#!/bin/bash

# Health Check Script for EchoTune AI Production Deployment
# Performs comprehensive system, application, and security validation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HEALTH_LOG="${HEALTH_LOG:-/var/log/health-check.log}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
fi

# Default configuration
APP_URL="${FRONTEND_URL:-http://localhost:3000}"
DOMAIN="${DOMAIN:-localhost}"
TIMEOUT="${HEALTH_TIMEOUT:-10}"
CRITICAL_THRESHOLD="${CRITICAL_THRESHOLD:-5}"
WARNING_THRESHOLD="${WARNING_THRESHOLD:-3}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
WARNING_CHECKS=0
FAILED_CHECKS=0

# Results storage
declare -a RESULTS=()

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" | tee -a "$HEALTH_LOG"
}

# Print colored output
print_status() {
    local status="$1"
    local message="$2"
    
    case "$status" in
        "PASS")
            echo -e "${GREEN}✓ PASS${NC}: $message"
            ;;
        "WARN")
            echo -e "${YELLOW}⚠ WARN${NC}: $message"
            ;;
        "FAIL")
            echo -e "${RED}✗ FAIL${NC}: $message"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ INFO${NC}: $message"
            ;;
    esac
}

# Add result to tracking
add_result() {
    local status="$1"
    local check="$2"
    local details="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    case "$status" in
        "PASS")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            ;;
        "WARN")
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
            ;;
        "FAIL")
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            ;;
    esac
    
    RESULTS+=("$status|$check|$details")
    print_status "$status" "$check: $details"
    log "$status" "$check: $details"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check HTTP endpoint
check_http() {
    local url="$1"
    local expected_status="${2:-200}"
    local timeout="${3:-$TIMEOUT}"
    
    if command_exists curl; then
        local response
        response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
        
        if [[ "$response" == "$expected_status" ]]; then
            return 0
        else
            echo "HTTP $response"
            return 1
        fi
    else
        echo "curl not available"
        return 1
    fi
}

# Check port availability
check_port() {
    local host="$1"
    local port="$2"
    local timeout="${3:-5}"
    
    if command_exists nc; then
        nc -z -w "$timeout" "$host" "$port" 2>/dev/null
    elif command_exists timeout; then
        timeout "$timeout" bash -c "</dev/tcp/$host/$port" 2>/dev/null
    else
        return 1
    fi
}

# Check disk space
check_disk_space() {
    local path="$1"
    local threshold="${2:-90}"
    
    if command_exists df; then
        local usage
        usage=$(df "$path" | awk 'NR==2 {print $5}' | sed 's/%//')
        
        if [[ "$usage" -lt "$threshold" ]]; then
            echo "${usage}% used"
            return 0
        else
            echo "${usage}% used (threshold: ${threshold}%)"
            return 1
        fi
    else
        echo "df not available"
        return 1
    fi
}

# Check memory usage
check_memory() {
    local threshold="${1:-90}"
    
    if command_exists free; then
        local usage
        usage=$(free | grep Mem | awk '{printf("%.0f", ($3/$2) * 100)}')
        
        if [[ "$usage" -lt "$threshold" ]]; then
            echo "${usage}% used"
            return 0
        else
            echo "${usage}% used (threshold: ${threshold}%)"
            return 1
        fi
    else
        echo "free not available"
        return 1
    fi
}

# Check CPU load
check_cpu_load() {
    local threshold="${1:-2.0}"
    
    if command_exists uptime; then
        local load
        load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
        
        if command_exists bc && (( $(echo "$load < $threshold" | bc -l) )); then
            echo "load average: $load"
            return 0
        else
            echo "load average: $load (threshold: $threshold)"
            return 1
        fi
    else
        echo "uptime not available"
        return 1
    fi
}

# Check SSL certificate
check_ssl_certificate() {
    local domain="$1"
    local days_threshold="${2:-30}"
    
    if command_exists openssl; then
        local cert_info
        cert_info=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "FAILED")
        
        if [[ "$cert_info" == "FAILED" ]]; then
            echo "certificate check failed"
            return 1
        fi
        
        local expiry_date
        expiry_date=$(echo "$cert_info" | grep "notAfter" | cut -d= -f2)
        
        if command_exists date; then
            local expiry_epoch
            expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || echo "0")
            local current_epoch
            current_epoch=$(date +%s)
            local days_remaining
            days_remaining=$(( (expiry_epoch - current_epoch) / 86400 ))
            
            if [[ "$days_remaining" -gt "$days_threshold" ]]; then
                echo "expires in $days_remaining days"
                return 0
            else
                echo "expires in $days_remaining days (threshold: $days_threshold)"
                return 1
            fi
        else
            echo "date command not available"
            return 1
        fi
    else
        echo "openssl not available"
        return 1
    fi
}

# Check database connectivity
check_database() {
    if [[ -n "${MONGODB_URI:-}" ]]; then
        # MongoDB check would require mongo client
        echo "MongoDB URI configured"
        return 0
    elif [[ -n "${DATABASE_URL:-}" ]]; then
        # PostgreSQL check would require psql
        echo "PostgreSQL URL configured"
        return 0
    else
        echo "no database configured"
        return 0
    fi
}

# Check log files
check_log_files() {
    local log_dir="${1:-/var/log}"
    local max_size_mb="${2:-100}"
    
    if [[ -d "$log_dir" ]]; then
        local large_files
        large_files=$(find "$log_dir" -name "*.log" -size +"${max_size_mb}M" 2>/dev/null | wc -l)
        
        if [[ "$large_files" -eq 0 ]]; then
            echo "all log files under ${max_size_mb}MB"
            return 0
        else
            echo "$large_files log files over ${max_size_mb}MB"
            return 1
        fi
    else
        echo "log directory not found"
        return 1
    fi
}

# System checks
run_system_checks() {
    print_status "INFO" "Running system health checks..."
    
    # Disk space checks
    local result
    result=$(check_disk_space "/" 90)
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "Disk space (/)" "$result"
    else
        add_result "FAIL" "Disk space (/)" "$result"
    fi
    
    # Memory check
    result=$(check_memory 85)
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "Memory usage" "$result"
    else
        add_result "WARN" "Memory usage" "$result"
    fi
    
    # CPU load check
    result=$(check_cpu_load 2.0)
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "CPU load" "$result"
    else
        add_result "WARN" "CPU load" "$result"
    fi
    
    # Log files check
    result=$(check_log_files "/var/log" 100)
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "Log file sizes" "$result"
    else
        add_result "WARN" "Log file sizes" "$result"
    fi
}

# Application checks
run_application_checks() {
    print_status "INFO" "Running application health checks..."
    
    # Application HTTP check
    local result
    result=$(check_http "$APP_URL/health")
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "Application health endpoint" "HTTP 200"
    else
        add_result "FAIL" "Application health endpoint" "$result"
    fi
    
    # API endpoint check
    result=$(check_http "$APP_URL/api/health")
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "API health endpoint" "HTTP 200"
    else
        add_result "WARN" "API health endpoint" "$result"
    fi
    
    # Database connectivity
    result=$(check_database)
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "Database configuration" "$result"
    else
        add_result "FAIL" "Database configuration" "$result"
    fi
}

# Security checks
run_security_checks() {
    print_status "INFO" "Running security health checks..."
    
    # SSL certificate check (only for non-localhost domains)
    if [[ "$DOMAIN" != "localhost" ]] && [[ "$DOMAIN" != *.local ]]; then
        local result
        result=$(check_ssl_certificate "$DOMAIN" 30)
        if [[ $? -eq 0 ]]; then
            add_result "PASS" "SSL certificate" "$result"
        else
            add_result "WARN" "SSL certificate" "$result"
        fi
        
        # HTTPS endpoint check
        result=$(check_http "https://$DOMAIN/health")
        if [[ $? -eq 0 ]]; then
            add_result "PASS" "HTTPS endpoint" "HTTP 200"
        else
            add_result "FAIL" "HTTPS endpoint" "$result"
        fi
    fi
    
    # Check for nginx process
    if pgrep nginx >/dev/null; then
        add_result "PASS" "Nginx process" "running"
    else
        add_result "FAIL" "Nginx process" "not running"
    fi
}

# Service checks
run_service_checks() {
    print_status "INFO" "Running service health checks..."
    
    # Port availability checks
    local result
    
    # HTTP port
    result=$(check_port localhost 80)
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "HTTP port (80)" "accessible"
    else
        add_result "WARN" "HTTP port (80)" "not accessible"
    fi
    
    # HTTPS port
    result=$(check_port localhost 443)
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "HTTPS port (443)" "accessible"
    else
        add_result "WARN" "HTTPS port (443)" "not accessible"
    fi
    
    # Application port
    result=$(check_port localhost 3000)
    if [[ $? -eq 0 ]]; then
        add_result "PASS" "Application port (3000)" "accessible"
    else
        add_result "FAIL" "Application port (3000)" "not accessible"
    fi
}

# Generate summary report
generate_summary() {
    echo ""
    print_status "INFO" "Health Check Summary"
    echo "=================================="
    echo "Total checks: $TOTAL_CHECKS"
    echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
    echo -e "Warnings: ${YELLOW}$WARNING_CHECKS${NC}"
    echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"
    echo ""
    
    # Determine overall status
    local overall_status
    if [[ $FAILED_CHECKS -ge $CRITICAL_THRESHOLD ]]; then
        overall_status="CRITICAL"
        print_status "FAIL" "Overall system status: CRITICAL"
    elif [[ $FAILED_CHECKS -gt 0 ]] || [[ $WARNING_CHECKS -ge $WARNING_THRESHOLD ]]; then
        overall_status="WARNING"
        print_status "WARN" "Overall system status: WARNING"
    else
        overall_status="HEALTHY"
        print_status "PASS" "Overall system status: HEALTHY"
    fi
    
    # Log summary
    log "INFO" "Health check completed - Status: $overall_status, Passed: $PASSED_CHECKS, Warnings: $WARNING_CHECKS, Failed: $FAILED_CHECKS"
    
    return $FAILED_CHECKS
}

# Send alerts if configured
send_alerts() {
    local status="$1"
    
    if [[ "$status" != "HEALTHY" ]]; then
        local message="EchoTune AI Health Check Alert - Status: $status (Failed: $FAILED_CHECKS, Warnings: $WARNING_CHECKS)"
        
        # Email alert
        if [[ -n "$ALERT_EMAIL" ]] && command_exists mail; then
            echo "$message" | mail -s "EchoTune AI Health Alert" "$ALERT_EMAIL"
            log "INFO" "Email alert sent to $ALERT_EMAIL"
        fi
        
        # Slack webhook
        if [[ -n "$SLACK_WEBHOOK" ]] && command_exists curl; then
            curl -X POST -H 'Content-type: application/json' \
                --data '{"text":"'"$message"'"}' \
                "$SLACK_WEBHOOK" >/dev/null 2>&1
            log "INFO" "Slack alert sent"
        fi
    fi
}

# Main execution
main() {
    local check_type="${1:-all}"
    
    echo "EchoTune AI Health Check"
    echo "========================"
    echo "Timestamp: $(date)"
    echo "Domain: $DOMAIN"
    echo "App URL: $APP_URL"
    echo ""
    
    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "$HEALTH_LOG")"
    
    log "INFO" "Starting health check (type: $check_type)"
    
    case "$check_type" in
        "system")
            run_system_checks
            ;;
        "application")
            run_application_checks
            ;;
        "security")
            run_security_checks
            ;;
        "services")
            run_service_checks
            ;;
        "all")
            run_system_checks
            run_application_checks
            run_security_checks
            run_service_checks
            ;;
        *)
            echo "Usage: $0 [system|application|security|services|all]"
            exit 1
            ;;
    esac
    
    generate_summary
    local exit_code=$?
    
    # Determine overall status for alerts
    local overall_status
    if [[ $FAILED_CHECKS -ge $CRITICAL_THRESHOLD ]]; then
        overall_status="CRITICAL"
    elif [[ $FAILED_CHECKS -gt 0 ]] || [[ $WARNING_CHECKS -ge $WARNING_THRESHOLD ]]; then
        overall_status="WARNING"
    else
        overall_status="HEALTHY"
    fi
    
    send_alerts "$overall_status"
    
    log "INFO" "Health check completed with exit code $exit_code"
    exit $exit_code
}

# Execute main function
main "$@"