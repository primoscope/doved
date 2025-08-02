#!/bin/bash

# System Maintenance Script for EchoTune AI Production
# Performs routine maintenance tasks to keep the system running optimally

set -euo pipefail

# Configuration
PROJECT_DIR="/opt/echotune"
LOG_DIR="/var/log/echotune"
BACKUP_DIR="/opt/echotune/backups"
MAINTENANCE_LOG="${LOG_DIR}/maintenance.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    local message="[$(date +'%Y-%m-%d %H:%M:%S')] $1"
    echo -e "${GREEN}${message}${NC}"
    echo "$message" >> "$MAINTENANCE_LOG" 2>/dev/null || true
}

warn() {
    local message="[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1"
    echo -e "${YELLOW}${message}${NC}"
    echo "$message" >> "$MAINTENANCE_LOG" 2>/dev/null || true
}

error() {
    local message="[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1"
    echo -e "${RED}${message}${NC}"
    echo "$message" >> "$MAINTENANCE_LOG" 2>/dev/null || true
}

info() {
    local message="[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1"
    echo -e "${BLUE}${message}${NC}"
    echo "$message" >> "$MAINTENANCE_LOG" 2>/dev/null || true
}

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR" 2>/dev/null || true

# Check disk space
check_disk_space() {
    info "Checking disk space..."
    
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    local available_space=$(df -h / | tail -1 | awk '{print $4}')
    
    if [[ $disk_usage -gt 90 ]]; then
        error "Critical: Disk usage is ${disk_usage}% (Available: ${available_space})"
        return 1
    elif [[ $disk_usage -gt 80 ]]; then
        warn "High disk usage: ${disk_usage}% (Available: ${available_space})"
    else
        log "Disk usage is healthy: ${disk_usage}% (Available: ${available_space})"
    fi
}

# Clean Docker system
clean_docker() {
    info "Cleaning Docker system..."
    
    # Remove unused images, containers, networks
    local cleaned=$(docker system prune -f 2>&1 | grep "Total reclaimed space" || echo "0B")
    log "Docker cleanup completed: $cleaned"
    
    # Remove dangling images
    local dangling_images=$(docker images -f "dangling=true" -q)
    if [[ -n "$dangling_images" ]]; then
        docker rmi $dangling_images
        log "Removed dangling Docker images"
    fi
    
    # Remove old unused volumes (be careful with this)
    local unused_volumes=$(docker volume ls -f dangling=true -q)
    if [[ -n "$unused_volumes" ]]; then
        docker volume rm $unused_volumes
        log "Removed unused Docker volumes"
    fi
}

# Rotate logs
rotate_logs() {
    info "Rotating logs..."
    
    # Force log rotation
    if command -v logrotate &> /dev/null; then
        logrotate -f /etc/logrotate.d/echotune 2>/dev/null || true
        log "System log rotation completed"
    fi
    
    # Manual rotation for large Docker logs
    local docker_logs_dir="/var/lib/docker/containers"
    if [[ -d "$docker_logs_dir" ]]; then
        find "$docker_logs_dir" -name "*-json.log" -size +100M -exec truncate -s 0 {} \;
        log "Large Docker logs truncated"
    fi
}

# Update system packages
update_system() {
    info "Updating system packages..."
    
    # Update package lists
    apt update -qq
    
    # Check for available upgrades
    local upgrades=$(apt list --upgradable 2>/dev/null | wc -l)
    
    if [[ $upgrades -gt 1 ]]; then
        info "Found $((upgrades-1)) package upgrades available"
        
        # Only install security updates automatically
        if command -v unattended-upgrade &> /dev/null; then
            unattended-upgrade -d
            log "Security updates installed automatically"
        else
            warn "Manual package updates recommended: sudo apt upgrade"
        fi
    else
        log "All packages are up to date"
    fi
}

# Check SSL certificates
check_ssl_certificates() {
    info "Checking SSL certificates..."
    
    local domain="primosphere.studio"
    local cert_path="/etc/letsencrypt/live/$domain/fullchain.pem"
    
    if [[ -f "$cert_path" ]]; then
        local expiry_date=$(openssl x509 -in "$cert_path" -text -noout | grep "Not After" | cut -d: -f2- | xargs)
        local expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || echo "0")
        local current_epoch=$(date +%s)
        local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
        
        if [[ $days_until_expiry -gt 30 ]]; then
            log "SSL certificate is valid for $days_until_expiry more days"
        elif [[ $days_until_expiry -gt 7 ]]; then
            warn "SSL certificate expires in $days_until_expiry days - renewal recommended"
        else
            error "SSL certificate expires in $days_until_expiry days - immediate renewal required"
            
            # Try automatic renewal
            if command -v certbot &> /dev/null; then
                info "Attempting automatic SSL renewal..."
                if certbot renew --quiet; then
                    log "SSL certificate renewed successfully"
                    # Restart nginx to use new certificate
                    cd "$PROJECT_DIR" && docker-compose restart nginx
                else
                    error "SSL renewal failed - manual intervention required"
                fi
            fi
        fi
    else
        warn "SSL certificate not found at $cert_path"
    fi
}

# Monitor system resources
monitor_resources() {
    info "Monitoring system resources..."
    
    # Memory usage
    local memory_info=$(free | grep Mem:)
    local total_memory=$(echo $memory_info | awk '{print $2}')
    local used_memory=$(echo $memory_info | awk '{print $3}')
    local memory_usage=$((used_memory * 100 / total_memory))
    
    # CPU load
    local cpu_load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    
    # Disk I/O
    local disk_io=$(iostat -d 1 2 2>/dev/null | tail -1 | awk '{print $4}' || echo "0")
    
    log "System Resources: Memory: ${memory_usage}%, CPU Load: ${cpu_load}, Disk I/O: ${disk_io}"
    
    # Alert on high usage
    if [[ $memory_usage -gt 85 ]]; then
        warn "High memory usage: ${memory_usage}%"
    fi
    
    if [[ $(echo "$cpu_load > 2.0" | bc -l 2>/dev/null || echo "0") -eq 1 ]]; then
        warn "High CPU load: $cpu_load"
    fi
}

# Check application health
check_application_health() {
    info "Checking application health..."
    
    cd "$PROJECT_DIR"
    
    # Check if containers are running
    local container_status=$(docker-compose ps --services --filter status=running)
    if [[ -z "$container_status" ]]; then
        error "No Docker containers are running"
        return 1
    fi
    
    # Check application endpoint
    local health_check=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/health" 2>/dev/null || echo "000")
    if [[ "$health_check" == "200" ]]; then
        log "Application health check passed"
    else
        error "Application health check failed (HTTP $health_check)"
        
        # Try to restart application
        info "Attempting to restart application..."
        docker-compose restart app
        sleep 10
        
        # Check again
        local retry_health=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/health" 2>/dev/null || echo "000")
        if [[ "$retry_health" == "200" ]]; then
            log "Application restarted successfully"
        else
            error "Application restart failed - manual intervention required"
        fi
    fi
}

# Optimize database connections
optimize_database() {
    info "Checking database connections..."
    
    # Check MongoDB connection if configured
    if [[ -f "${PROJECT_DIR}/.env" ]] && grep -q "MONGODB_URI" "${PROJECT_DIR}/.env"; then
        local mongo_uri=$(grep "MONGODB_URI" "${PROJECT_DIR}/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        
        if [[ -n "$mongo_uri" && "$mongo_uri" != *"copilot:DapperMan77"* ]]; then
            if command -v mongosh &> /dev/null; then
                if timeout 10 mongosh "$mongo_uri" --eval "db.runCommand('ping').ok" &>/dev/null; then
                    log "MongoDB connection is healthy"
                else
                    warn "MongoDB connection test failed"
                fi
            fi
        fi
    fi
}

# Clean up old backups
cleanup_old_backups() {
    info "Cleaning up old backups..."
    
    if [[ -d "$BACKUP_DIR" ]]; then
        local deleted_count=0
        while IFS= read -r -d '' backup_file; do
            rm -rf "$backup_file"
            ((deleted_count++))
        done < <(find "$BACKUP_DIR" -type f -mtime +30 -print0 2>/dev/null)
        
        if [[ $deleted_count -gt 0 ]]; then
            log "Cleaned up $deleted_count old backup files"
        else
            log "No old backups to clean up"
        fi
        
        # Show current backup disk usage
        local backup_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "0")
        log "Current backup directory size: $backup_size"
    fi
}

# Generate maintenance report
generate_report() {
    info "=== Maintenance Report ==="
    echo "Timestamp: $(date)"
    echo "Hostname: $(hostname)"
    echo "Uptime: $(uptime -p)"
    echo
    
    # System info
    echo "System Information:"
    echo "  OS: $(lsb_release -d 2>/dev/null | cut -f2 || uname -a)"
    echo "  Kernel: $(uname -r)"
    echo "  Memory: $(free -h | grep Mem: | awk '{print $3 "/" $2}')"
    echo "  Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
    echo
    
    # Docker info
    if command -v docker &> /dev/null; then
        echo "Docker Information:"
        echo "  Version: $(docker --version | cut -d' ' -f3 | sed 's/,//')"
        echo "  Containers: $(docker ps --format 'table {{.Names}}\t{{.Status}}' | tail -n +2 | wc -l) running"
        echo "  Images: $(docker images -q | wc -l) total"
        echo
    fi
    
    # SSL certificate info
    local domain="primosphere.studio"
    local cert_path="/etc/letsencrypt/live/$domain/fullchain.pem"
    if [[ -f "$cert_path" ]]; then
        echo "SSL Certificate:"
        local expiry_date=$(openssl x509 -in "$cert_path" -text -noout | grep "Not After" | cut -d: -f2- | xargs)
        echo "  Domain: $domain"
        echo "  Expires: $expiry_date"
        echo
    fi
    
    log "Maintenance report generated"
}

# Send maintenance notification
send_notification() {
    local message="$1"
    local alert_email="${ALERT_EMAIL:-admin@primosphere.studio}"
    local slack_webhook="${SLACK_WEBHOOK:-}"
    
    # Email notification (if mail is available)
    if command -v mail &> /dev/null && [[ -n "$alert_email" ]]; then
        echo "$message" | mail -s "EchoTune Maintenance Report - $(hostname)" "$alert_email" 2>/dev/null || true
    fi
    
    # Slack notification (if webhook is configured)
    if [[ -n "$slack_webhook" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"EchoTune Maintenance Report - $(hostname)\n$message\"}" \
            "$slack_webhook" 2>/dev/null || true
    fi
}

# Main maintenance routine
main() {
    log "Starting system maintenance routine..."
    
    local start_time=$(date +%s)
    local issues=0
    
    # Run maintenance tasks
    check_disk_space || ((issues++))
    clean_docker
    rotate_logs
    update_system
    check_ssl_certificates || ((issues++))
    monitor_resources
    check_application_health || ((issues++))
    optimize_database
    cleanup_old_backups
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "Maintenance routine completed in ${duration} seconds"
    
    if [[ $issues -gt 0 ]]; then
        warn "Maintenance completed with $issues issues detected"
        generate_report
    else
        log "Maintenance completed successfully with no issues"
        generate_report
    fi
    
    # Send notification for issues or weekly summary
    if [[ $issues -gt 0 ]] || [[ "${1:-}" == "--notify" ]]; then
        local report=$(generate_report)
        send_notification "$report"
    fi
    
    exit $issues
}

# Handle command line arguments
case "${1:-}" in
    --disk-only)
        check_disk_space
        ;;
    --docker-only)
        clean_docker
        ;;
    --ssl-only)
        check_ssl_certificates
        ;;
    --health-only)
        check_application_health
        ;;
    --report)
        generate_report
        ;;
    --notify)
        main --notify
        ;;
    --help|-h)
        echo "EchoTune AI System Maintenance Script"
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --disk-only      Check disk space only"
        echo "  --docker-only    Clean Docker system only"
        echo "  --ssl-only       Check SSL certificates only"
        echo "  --health-only    Check application health only"
        echo "  --report         Generate maintenance report only"
        echo "  --notify         Run full maintenance with notification"
        echo "  --help           Show this help message"
        echo
        echo "Default: Run full maintenance routine"
        ;;
    *)
        main "$@"
        ;;
esac