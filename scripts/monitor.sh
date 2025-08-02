#!/bin/bash

# EchoTune AI - Production Health Monitor
# Monitors application health and restarts if needed

LOG_FILE="/var/log/echotune-monitor.log"
APP_DIR="/opt/echotune"
HEALTH_URL="http://localhost:3000/health"
MAX_FAILURES=3
FAILURE_COUNT=0

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_health() {
    if curl -f -s "$HEALTH_URL" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

restart_application() {
    log_message "⚠️  Restarting application due to health check failures"
    cd "$APP_DIR"
    docker-compose restart app
    sleep 30
    
    if check_health; then
        log_message "✅ Application restarted successfully"
        FAILURE_COUNT=0
    else
        log_message "❌ Application restart failed"
    fi
}

# Main monitoring loop
log_message "🔍 Starting EchoTune AI health monitor"

while true; do
    if check_health; then
        if [ $FAILURE_COUNT -gt 0 ]; then
            log_message "✅ Application recovered (was failing)"
        fi
        FAILURE_COUNT=0
    else
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        log_message "❌ Health check failed ($FAILURE_COUNT/$MAX_FAILURES)"
        
        if [ $FAILURE_COUNT -ge $MAX_FAILURES ]; then
            restart_application
        fi
    fi
    
    sleep 60
done