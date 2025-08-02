#!/bin/bash

# Comprehensive Health Check Script for EchoTune AI Production
# Monitors application health, dependencies, and system resources

set -euo pipefail

# Configuration
CONFIG_FILE="/opt/echotune/.env"
HEALTH_LOG="/var/log/echotune/health.log"
ALERT_EMAIL="admin@primosphere.studio"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK:-}"

# Thresholds (can be overridden by environment variables)
CPU_THRESHOLD=${CPU_THRESHOLD:-80}
MEMORY_THRESHOLD=${MEMORY_THRESHOLD:-85}
DISK_THRESHOLD=${DISK_THRESHOLD:-90}
RESPONSE_TIME_THRESHOLD=${RESPONSE_TIME_THRESHOLD:-5000}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Health check results
declare -A CHECKS
OVERALL_STATUS="HEALTHY"

# Logging functions
log() {
    local message="$1"
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[${timestamp}] ${message}${NC}"
    echo "[${timestamp}] ${message}" >> "${HEALTH_LOG}" 2>/dev/null || true
}

warn() {
    local message="$1"
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[${timestamp}] WARNING: ${message}${NC}"
    echo "[${timestamp}] WARNING: ${message}" >> "${HEALTH_LOG}" 2>/dev/null || true
}

error() {
    local message="$1"
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[${timestamp}] ERROR: ${message}${NC}"
    echo "[${timestamp}] ERROR: ${message}" >> "${HEALTH_LOG}" 2>/dev/null || true
    OVERALL_STATUS="UNHEALTHY"
}

info() {
    local message="$1"
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[${timestamp}] INFO: ${message}${NC}"
}

# Create log directory if it doesn't exist
mkdir -p "$(dirname "${HEALTH_LOG}")" 2>/dev/null || true

# Check application health endpoint
check_app_health() {
    local check_name="app_health"
    info "Checking application health endpoint..."
    
    local start_time=$(date +%s%3N)
    local response=$(curl -s -w "%{http_code}:%{time_total}" --max-time 10 "http://localhost:3000/health" 2>/dev/null || echo "000:10.000")
    local end_time=$(date +%s%3N)
    
    local http_code=$(echo "$response" | cut -d':' -f1)
    local response_time_float=$(echo "$response" | cut -d':' -f2)
    local response_time=$(echo "$response_time_float * 1000" | bc -l 2>/dev/null || echo "10000")
    local response_time_int=${response_time%.*}
    
    if [[ "$http_code" == "200" ]]; then
        if [[ $response_time_int -lt $RESPONSE_TIME_THRESHOLD ]]; then
            log "✓ Application health check passed (${response_time_int}ms)"
            CHECKS[$check_name]="PASS"
        else
            warn "Application response time too slow: ${response_time_int}ms (threshold: ${RESPONSE_TIME_THRESHOLD}ms)"
            CHECKS[$check_name]="WARN"
        fi
    else
        error "Application health check failed (HTTP ${http_code})"
        CHECKS[$check_name]="FAIL"
    fi
}

# Check HTTPS endpoint
check_https_health() {
    local check_name="https_health"
    info "Checking HTTPS endpoint..."
    
    local response=$(curl -s -w "%{http_code}" --max-time 10 "https://primosphere.studio/health" 2>/dev/null || echo "000")
    
    if [[ "$response" == "200" ]]; then
        log "✓ HTTPS health check passed"
        CHECKS[$check_name]="PASS"
    else
        error "HTTPS health check failed (HTTP ${response})"
        CHECKS[$check_name]="FAIL"
    fi
}

# Check SSL certificate
check_ssl_certificate() {
    local check_name="ssl_certificate"
    info "Checking SSL certificate..."
    
    local domain="primosphere.studio"
    local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
    
    if [[ -f "$cert_path" ]]; then
        local expiry_date=$(openssl x509 -in "$cert_path" -text -noout | grep "Not After" | cut -d: -f2- | xargs)
        local expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || echo "0")
        local current_epoch=$(date +%s)
        local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        if [[ $days_until_expiry -gt 30 ]]; then
            log "✓ SSL certificate valid (expires in ${days_until_expiry} days)"
            CHECKS[$check_name]="PASS"
        elif [[ $days_until_expiry -gt 7 ]]; then
            warn "SSL certificate expires in ${days_until_expiry} days"
            CHECKS[$check_name]="WARN"
        else
            error "SSL certificate expires in ${days_until_expiry} days"
            CHECKS[$check_name]="FAIL"
        fi
    else
        error "SSL certificate not found at ${cert_path}"
        CHECKS[$check_name]="FAIL"
    fi
}

# Check Docker containers
check_docker_containers() {
    local check_name="docker_containers"
    info "Checking Docker containers..."
    
    if command -v docker &> /dev/null; then
        local containers=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(app|nginx|mongo)" || true)
        
        if [[ -n "$containers" ]]; then
            local unhealthy_containers=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" || true)
            
            if [[ -z "$unhealthy_containers" ]]; then
                log "✓ All Docker containers are healthy"
                CHECKS[$check_name]="PASS"
            else
                error "Unhealthy Docker containers: $unhealthy_containers"
                CHECKS[$check_name]="FAIL"
            fi
        else
            warn "No Docker containers found running"
            CHECKS[$check_name]="WARN"
        fi
    else
        warn "Docker not available"
        CHECKS[$check_name]="WARN"
    fi
}

# Check system resources
check_system_resources() {
    local check_name="system_resources"
    info "Checking system resources..."
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' || echo "0")
    cpu_usage=${cpu_usage%.*}
    
    # Memory usage
    local memory_info=$(free | grep Mem:)
    local total_memory=$(echo $memory_info | awk '{print $2}')
    local used_memory=$(echo $memory_info | awk '{print $3}')
    local memory_usage=$((used_memory * 100 / total_memory))
    
    # Disk usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    
    local resource_status="PASS"
    
    if [[ $cpu_usage -gt $CPU_THRESHOLD ]]; then
        warn "High CPU usage: ${cpu_usage}% (threshold: ${CPU_THRESHOLD}%)"
        resource_status="WARN"
    fi
    
    if [[ $memory_usage -gt $MEMORY_THRESHOLD ]]; then
        warn "High memory usage: ${memory_usage}% (threshold: ${MEMORY_THRESHOLD}%)"
        resource_status="WARN"
    fi
    
    if [[ $disk_usage -gt $DISK_THRESHOLD ]]; then
        error "High disk usage: ${disk_usage}% (threshold: ${DISK_THRESHOLD}%)"
        resource_status="FAIL"
    fi
    
    if [[ "$resource_status" == "PASS" ]]; then
        log "✓ System resources within normal limits"
        log "  CPU: ${cpu_usage}%, Memory: ${memory_usage}%, Disk: ${disk_usage}%"
    fi
    
    CHECKS[$check_name]=$resource_status
}

# Check database connectivity
check_database() {
    local check_name="database"
    info "Checking database connectivity..."
    
    # Check MongoDB if configured
    if [[ -f "$CONFIG_FILE" ]] && grep -q "MONGODB_URI" "$CONFIG_FILE"; then
        local mongo_uri=$(grep "MONGODB_URI" "$CONFIG_FILE" | cut -d'=' -f2- | tr -d '"')
        
        if [[ -n "$mongo_uri" && "$mongo_uri" != "mongodb+srv://copilot:DapperMan77@cluster.mongodb.net/echotune_prod" ]]; then
            # Test MongoDB connection (requires mongosh or mongo client)
            if command -v mongosh &> /dev/null; then
                if timeout 10 mongosh "$mongo_uri" --eval "db.runCommand('ping').ok" &>/dev/null; then
                    log "✓ MongoDB connection successful"
                    CHECKS[$check_name]="PASS"
                else
                    error "MongoDB connection failed"
                    CHECKS[$check_name]="FAIL"
                fi
            else
                warn "MongoDB client not available for testing"
                CHECKS[$check_name]="WARN"
            fi
        else
            warn "MongoDB URI not configured or using default"
            CHECKS[$check_name]="WARN"
        fi
    else
        warn "No database configuration found"
        CHECKS[$check_name]="WARN"
    fi
}

# Check external API connectivity
check_external_apis() {
    local check_name="external_apis"
    info "Checking external API connectivity..."
    
    local api_status="PASS"
    
    # Test Spotify API
    if curl -s --max-time 10 "https://api.spotify.com/v1" &>/dev/null; then
        log "✓ Spotify API accessible"
    else
        warn "Spotify API not accessible"
        api_status="WARN"
    fi
    
    # Test Google APIs (if configured)
    if curl -s --max-time 10 "https://generativelanguage.googleapis.com" &>/dev/null; then
        log "✓ Google Generative AI API accessible"
    else
        warn "Google Generative AI API not accessible"
        api_status="WARN"
    fi
    
    CHECKS[$check_name]=$api_status
}

# Check log files
check_logs() {
    local check_name="logs"
    info "Checking log files..."
    
    local log_status="PASS"
    local log_files=(
        "/var/log/nginx/echotune_error.log"
        "/var/log/echotune/app.log"
        "/var/log/echotune/error.log"
    )
    
    for log_file in "${log_files[@]}"; do
        if [[ -f "$log_file" ]]; then
            # Check for recent errors (last 5 minutes)
            local recent_errors=$(grep -c "$(date -d '5 minutes ago' '+%Y-%m-%d %H:%M')" "$log_file" 2>/dev/null || echo "0")
            
            if [[ $recent_errors -gt 10 ]]; then
                warn "High error rate in ${log_file}: ${recent_errors} errors in last 5 minutes"
                log_status="WARN"
            fi
            
            # Check log file size (warn if > 100MB)
            local file_size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo "0")
            local file_size_mb=$((file_size / 1024 / 1024))
            
            if [[ $file_size_mb -gt 100 ]]; then
                warn "Large log file: ${log_file} (${file_size_mb}MB)"
                log_status="WARN"
            fi
        fi
    done
    
    if [[ "$log_status" == "PASS" ]]; then
        log "✓ Log files look healthy"
    fi
    
    CHECKS[$check_name]=$log_status
}

# Send alert notification
send_alert() {
    local message="$1"
    local subject="EchoTune AI Health Alert - $(hostname)"
    
    # Email alert (if mail is available)
    if command -v mail &> /dev/null && [[ -n "$ALERT_EMAIL" ]]; then
        echo "$message" | mail -s "$subject" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    # Slack alert (if webhook is configured)
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$subject\n$message\"}" \
            "$SLACK_WEBHOOK_URL" 2>/dev/null || true
    fi
}

# Generate health report
generate_report() {
    info "=== Health Check Report ==="
    
    local failed_checks=()
    local warning_checks=()
    local passed_checks=()
    
    for check in "${!CHECKS[@]}"; do
        case "${CHECKS[$check]}" in
            "PASS")
                passed_checks+=("$check")
                ;;
            "WARN")
                warning_checks+=("$check")
                ;;
            "FAIL")
                failed_checks+=("$check")
                ;;
        esac
    done
    
    echo "Overall Status: $OVERALL_STATUS"
    echo "Timestamp: $(date)"
    echo "Hostname: $(hostname)"
    echo
    
    if [[ ${#passed_checks[@]} -gt 0 ]]; then
        echo "✓ Passed Checks (${#passed_checks[@]}):"
        printf '  - %s\n' "${passed_checks[@]}"
        echo
    fi
    
    if [[ ${#warning_checks[@]} -gt 0 ]]; then
        echo "⚠ Warning Checks (${#warning_checks[@]}):"
        printf '  - %s\n' "${warning_checks[@]}"
        echo
    fi
    
    if [[ ${#failed_checks[@]} -gt 0 ]]; then
        echo "✗ Failed Checks (${#failed_checks[@]}):"
        printf '  - %s\n' "${failed_checks[@]}"
        echo
        
        # Send alert for failed checks
        local alert_message="Health check failures detected:
$(printf '  - %s\n' "${failed_checks[@]}")

Please investigate immediately."
        send_alert "$alert_message"
    fi
}

# Main execution
main() {
    log "Starting comprehensive health check..."
    
    # Run all health checks
    check_app_health
    check_https_health
    check_ssl_certificate
    check_docker_containers
    check_system_resources
    check_database
    check_external_apis
    check_logs
    
    # Generate and display report
    generate_report
    
    log "Health check completed with status: $OVERALL_STATUS"
    
    # Exit with appropriate code
    if [[ "$OVERALL_STATUS" == "UNHEALTHY" ]]; then
        exit 1
    else
        exit 0
    fi
}

# Handle command line arguments
case "${1:-}" in
    --app-only)
        check_app_health
        ;;
    --ssl-only)
        check_ssl_certificate
        ;;
    --resources-only)
        check_system_resources
        ;;
    --help|-h)
        echo "Usage: $0 [options]"
        echo "Options:"
        echo "  --app-only       Check only application health"
        echo "  --ssl-only       Check only SSL certificate"
        echo "  --resources-only Check only system resources"
        echo "  --help           Show this help message"
        ;;
    *)
        main
        ;;
esac