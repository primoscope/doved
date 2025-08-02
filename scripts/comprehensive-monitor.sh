#!/bin/bash

# EchoTune AI - Comprehensive System Monitor and Health Check
# Advanced monitoring with metrics collection and alerting

set -e

# Configuration
APP_DIR="/opt/echotune"
LOG_DIR="${APP_DIR}/logs"
METRICS_DIR="${APP_DIR}/metrics"
HEALTH_URL="http://localhost:3000/health"
MAX_FAILURES=3
FAILURE_COUNT=0
CHECK_INTERVAL=60
METRICS_INTERVAL=300  # 5 minutes

# Alerting configuration
ALERT_EMAIL="${ALERT_EMAIL:-admin@primosphere.studio}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# Thresholds
CPU_THRESHOLD=80
MEMORY_THRESHOLD=85
DISK_THRESHOLD=90
RESPONSE_TIME_THRESHOLD=5000  # 5 seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize directories
mkdir -p "$LOG_DIR" "$METRICS_DIR"

LOG_FILE="$LOG_DIR/monitor.log"
METRICS_FILE="$METRICS_DIR/system_metrics.log"

log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local color=""
    
    case "$level" in
        "INFO") color="$BLUE" ;;
        "SUCCESS") color="$GREEN" ;;
        "WARNING") color="$YELLOW" ;;
        "ERROR") color="$RED" ;;
    esac
    
    echo -e "${color}[$timestamp] [$level]${NC} $message" | tee -a "$LOG_FILE"
}

# Health check function with detailed diagnostics
check_application_health() {
    local start_time=$(date +%s%3N)
    
    if curl -f -s --max-time 10 "$HEALTH_URL" > /tmp/health_response 2>&1; then
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        # Parse health response
        local status=$(cat /tmp/health_response | jq -r '.status' 2>/dev/null || echo "unknown")
        local features=$(cat /tmp/health_response | jq -r '.features' 2>/dev/null || echo "{}")
        
        log_message "SUCCESS" "Application healthy - Response time: ${response_time}ms, Status: $status"
        
        # Check response time threshold
        if [ "$response_time" -gt "$RESPONSE_TIME_THRESHOLD" ]; then
            log_message "WARNING" "Slow response time: ${response_time}ms (threshold: ${RESPONSE_TIME_THRESHOLD}ms)"
            send_alert "WARNING" "Slow application response time: ${response_time}ms"
        fi
        
        return 0
    else
        log_message "ERROR" "Application health check failed"
        return 1
    fi
}

# System resource monitoring
check_system_resources() {
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')
    cpu_usage=${cpu_usage%.*}  # Remove decimal part
    
    # Memory usage
    local memory_info=$(free | grep Mem)
    local total_mem=$(echo $memory_info | awk '{print $2}')
    local used_mem=$(echo $memory_info | awk '{print $3}')
    local memory_usage=$((used_mem * 100 / total_mem))
    
    # Disk usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    
    # Load average
    local load_avg=$(uptime | awk '{print $(NF-2)}' | sed 's/,//')
    
    # Log metrics
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$timestamp,CPU:$cpu_usage,Memory:$memory_usage,Disk:$disk_usage,Load:$load_avg" >> "$METRICS_FILE"
    
    log_message "INFO" "System metrics - CPU: ${cpu_usage}%, Memory: ${memory_usage}%, Disk: ${disk_usage}%, Load: $load_avg"
    
    # Check thresholds
    if [ "$cpu_usage" -gt "$CPU_THRESHOLD" ]; then
        log_message "WARNING" "High CPU usage: ${cpu_usage}% (threshold: ${CPU_THRESHOLD}%)"
        send_alert "WARNING" "High CPU usage: ${cpu_usage}%"
    fi
    
    if [ "$memory_usage" -gt "$MEMORY_THRESHOLD" ]; then
        log_message "WARNING" "High memory usage: ${memory_usage}% (threshold: ${MEMORY_THRESHOLD}%)"
        send_alert "WARNING" "High memory usage: ${memory_usage}%"
    fi
    
    if [ "$disk_usage" -gt "$DISK_THRESHOLD" ]; then
        log_message "WARNING" "High disk usage: ${disk_usage}% (threshold: ${DISK_THRESHOLD}%)"
        send_alert "WARNING" "High disk usage: ${disk_usage}%"
    fi
}

# Docker container health check
check_docker_health() {
    cd "$APP_DIR" || exit 1
    
    local containers=$(docker-compose ps -q)
    local all_healthy=true
    
    for container in $containers; do
        local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-health-check")
        local name=$(docker inspect --format='{{.Name}}' "$container" | sed 's/^.//')
        
        if [ "$status" = "healthy" ] || [ "$status" = "no-health-check" ]; then
            log_message "SUCCESS" "Container $name is healthy"
        else
            log_message "ERROR" "Container $name is unhealthy (status: $status)"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        return 0
    else
        return 1
    fi
}

# Database connectivity check
check_database_connectivity() {
    if [ -n "$MONGODB_URI" ]; then
        if timeout 10s node -e "
            const { MongoClient } = require('mongodb');
            MongoClient.connect('$MONGODB_URI', { serverSelectionTimeoutMS: 5000 })
                .then(() => { console.log('MongoDB OK'); process.exit(0); })
                .catch(() => { process.exit(1); });
        " > /dev/null 2>&1; then
            log_message "SUCCESS" "MongoDB connection healthy"
        else
            log_message "ERROR" "MongoDB connection failed"
            return 1
        fi
    fi
    
    if [ -n "$REDIS_URL" ]; then
        if timeout 5s redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
            log_message "SUCCESS" "Redis connection healthy"
        else
            log_message "ERROR" "Redis connection failed"
            return 1
        fi
    fi
    
    return 0
}

# SSL certificate check
check_ssl_certificates() {
    local domain="${DOMAIN:-primosphere.studio}"
    local cert_file="$APP_DIR/ssl/${domain}.crt"
    
    if [ -f "$cert_file" ]; then
        local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
        local expiry_timestamp=$(date -d "$expiry_date" +%s)
        local current_timestamp=$(date +%s)
        local days_until_expiry=$(((expiry_timestamp - current_timestamp) / 86400))
        
        if [ "$days_until_expiry" -lt 30 ]; then
            log_message "WARNING" "SSL certificate expires in $days_until_expiry days"
            send_alert "WARNING" "SSL certificate for $domain expires in $days_until_expiry days"
        else
            log_message "SUCCESS" "SSL certificate valid for $days_until_expiry days"
        fi
    else
        log_message "WARNING" "SSL certificate not found at $cert_file"
    fi
}

# Network connectivity check
check_external_connectivity() {
    local endpoints=(
        "https://api.spotify.com"
        "https://www.google.com"
        "8.8.8.8"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if timeout 10s curl -f -s "$endpoint" > /dev/null 2>&1; then
            log_message "SUCCESS" "External connectivity to $endpoint: OK"
        else
            log_message "WARNING" "External connectivity to $endpoint: FAILED"
        fi
    done
}

# Log file rotation and cleanup
rotate_logs() {
    # Rotate monitor logs if they get too large (>100MB)
    if [ -f "$LOG_FILE" ] && [ $(stat -c%s "$LOG_FILE") -gt 104857600 ]; then
        mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S)"
        touch "$LOG_FILE"
        log_message "INFO" "Rotated monitor log file"
    fi
    
    # Clean old metric files (keep 30 days)
    find "$METRICS_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
    
    # Clean old log files (keep 7 days)
    find "$LOG_DIR" -name "*.log.*" -mtime +7 -delete 2>/dev/null || true
}

# Alert sending function
send_alert() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local hostname=$(hostname)
    
    # Email alert
    if command -v mail &> /dev/null && [ -n "$ALERT_EMAIL" ]; then
        echo "EchoTune AI Alert - $level
        
Time: $timestamp
Host: $hostname
Level: $level
Message: $message

System Status:
$(check_system_resources 2>&1 | tail -5)
" | mail -s "EchoTune AI Alert: $level" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    # Slack alert
    if [ -n "$SLACK_WEBHOOK" ]; then
        local color="warning"
        case "$level" in
            "ERROR") color="danger" ;;
            "SUCCESS") color="good" ;;
        esac
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"EchoTune AI Alert\",\"attachments\":[{\"color\":\"$color\",\"fields\":[{\"title\":\"Level\",\"value\":\"$level\",\"short\":true},{\"title\":\"Host\",\"value\":\"$hostname\",\"short\":true},{\"title\":\"Message\",\"value\":\"$message\",\"short\":false}]}]}" \
            "$SLACK_WEBHOOK" > /dev/null 2>&1 || true
    fi
}

# Application restart function
restart_application() {
    log_message "WARNING" "Attempting to restart application due to health check failures"
    
    cd "$APP_DIR" || exit 1
    
    # Graceful restart
    if docker-compose restart app; then
        sleep 30
        
        if check_application_health; then
            log_message "SUCCESS" "Application restarted successfully"
            send_alert "SUCCESS" "Application recovered after restart"
            FAILURE_COUNT=0
            return 0
        else
            log_message "ERROR" "Application restart failed - still unhealthy"
            send_alert "ERROR" "Application restart failed - manual intervention required"
            return 1
        fi
    else
        log_message "ERROR" "Failed to restart application containers"
        send_alert "ERROR" "Docker restart failed - manual intervention required"
        return 1
    fi
}

# Performance metrics collection
collect_performance_metrics() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Application metrics
    local response_time=$(curl -o /dev/null -s -w '%{time_total}' "$HEALTH_URL" 2>/dev/null || echo "0")
    local response_time_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "0")
    
    # Docker stats
    local docker_stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "No containers")
    
    # Network stats
    local network_stats=$(ss -tuln | wc -l)
    
    echo "$timestamp,ResponseTime:${response_time_ms}ms,Connections:$network_stats" >> "$METRICS_DIR/performance_metrics.log"
    
    log_message "INFO" "Performance metrics - Response time: ${response_time_ms}ms, Connections: $network_stats"
}

# Main monitoring loop
main_loop() {
    log_message "INFO" "Starting EchoTune AI comprehensive health monitor"
    log_message "INFO" "Configuration - Check interval: ${CHECK_INTERVAL}s, Max failures: $MAX_FAILURES"
    
    local last_metrics_check=0
    
    while true; do
        local current_time=$(date +%s)
        
        # Application health check
        if check_application_health; then
            if [ $FAILURE_COUNT -gt 0 ]; then
                log_message "SUCCESS" "Application recovered (was failing)"
                send_alert "SUCCESS" "Application health check passed after $FAILURE_COUNT failures"
            fi
            FAILURE_COUNT=0
        else
            FAILURE_COUNT=$((FAILURE_COUNT + 1))
            log_message "ERROR" "Health check failed ($FAILURE_COUNT/$MAX_FAILURES)"
            
            if [ $FAILURE_COUNT -ge $MAX_FAILURES ]; then
                restart_application
            else
                send_alert "WARNING" "Application health check failed ($FAILURE_COUNT/$MAX_FAILURES)"
            fi
        fi
        
        # System resource checks (every iteration)
        check_system_resources
        check_docker_health
        
        # Less frequent checks (every 5 minutes)
        if [ $((current_time - last_metrics_check)) -ge $METRICS_INTERVAL ]; then
            check_database_connectivity
            check_ssl_certificates
            check_external_connectivity
            collect_performance_metrics
            rotate_logs
            last_metrics_check=$current_time
        fi
        
        sleep $CHECK_INTERVAL
    done
}

# Handle signals for graceful shutdown
trap 'log_message "INFO" "Monitor shutting down..."; exit 0' SIGTERM SIGINT

# Source environment variables if available
if [ -f "$APP_DIR/.env" ]; then
    set -a
    source "$APP_DIR/.env"
    set +a
fi

# Start monitoring
main_loop