#!/bin/bash

# Log Rotation and Monitoring Script for EchoTune AI
# Manages log files, rotation, monitoring, and alerting

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_CONFIG="/etc/echotune/log-rotation.conf"

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
fi

# Default configuration
LOG_DIRS="${LOG_DIRS:-/var/log/nginx /var/log/echotune /opt/echotune/logs}"
MAX_LOG_SIZE="${MAX_LOG_SIZE:-100M}"
MAX_LOG_FILES="${MAX_LOG_FILES:-10}"
COMPRESS_LOGS="${COMPRESS_LOGS:-true}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
DISK_THRESHOLD="${DISK_THRESHOLD:-90}"
LOG_MONITOR_LOG="/var/log/log-monitor.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_MONITOR_LOG"
}

# Print colored output
print_status() {
    local status="$1"
    local message="$2"
    
    case "$status" in
        "SUCCESS")
            echo -e "${GREEN}✓ SUCCESS${NC}: $message"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠ WARNING${NC}: $message"
            ;;
        "ERROR")
            echo -e "${RED}✗ ERROR${NC}: $message"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ INFO${NC}: $message"
            ;;
    esac
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get disk usage percentage
get_disk_usage() {
    local path="$1"
    df "$path" | awk 'NR==2 {print $5}' | sed 's/%//'
}

# Get directory size in MB
get_directory_size() {
    local path="$1"
    if [[ -d "$path" ]]; then
        du -sm "$path" 2>/dev/null | awk '{print $1}' || echo "0"
    else
        echo "0"
    fi
}

# Rotate log file
rotate_log_file() {
    local log_file="$1"
    local max_files="${2:-$MAX_LOG_FILES}"
    local compress="${3:-$COMPRESS_LOGS}"
    
    if [[ ! -f "$log_file" ]]; then
        return 0
    fi
    
    local log_dir=$(dirname "$log_file")
    local log_name=$(basename "$log_file")
    local log_base="${log_name%.*}"
    local log_ext="${log_name##*.}"
    
    # Rotate existing files
    for ((i=max_files-1; i>=1; i--)); do
        local old_file="$log_dir/${log_base}.${i}"
        local new_file="$log_dir/${log_base}.$((i+1))"
        
        if [[ "$compress" == "true" ]]; then
            old_file="${old_file}.gz"
            new_file="${new_file}.gz"
        fi
        
        if [[ -f "$old_file" ]]; then
            mv "$old_file" "$new_file"
        fi
    done
    
    # Move current log to .1
    local rotated_file="$log_dir/${log_base}.1"
    if [[ "$log_ext" != "$log_base" ]]; then
        rotated_file="$log_dir/${log_base}.1.${log_ext}"
    fi
    
    mv "$log_file" "$rotated_file"
    
    # Compress if enabled
    if [[ "$compress" == "true" ]]; then
        gzip "$rotated_file"
        log "INFO" "Rotated and compressed: $log_file"
    else
        log "INFO" "Rotated: $log_file"
    fi
    
    # Create new empty log file
    touch "$log_file"
    chmod 644 "$log_file"
    
    # Remove old files beyond retention
    for ((i=max_files+1; i<=max_files+5; i++)); do
        local old_file="$log_dir/${log_base}.${i}"
        if [[ "$compress" == "true" ]]; then
            old_file="${old_file}.gz"
        fi
        
        if [[ -f "$old_file" ]]; then
            rm -f "$old_file"
            log "INFO" "Removed old log file: $old_file"
        fi
    done
}

# Check if log file needs rotation
needs_rotation() {
    local log_file="$1"
    local max_size="${2:-$MAX_LOG_SIZE}"
    
    if [[ ! -f "$log_file" ]]; then
        return 1
    fi
    
    # Convert size to bytes
    local max_bytes
    case "${max_size: -1}" in
        "K"|"k")
            max_bytes=$((${max_size%?} * 1024))
            ;;
        "M"|"m")
            max_bytes=$((${max_size%?} * 1024 * 1024))
            ;;
        "G"|"g")
            max_bytes=$((${max_size%?} * 1024 * 1024 * 1024))
            ;;
        *)
            max_bytes="$max_size"
            ;;
    esac
    
    local file_size
    file_size=$(stat -c%s "$log_file" 2>/dev/null || echo "0")
    
    if [[ "$file_size" -gt "$max_bytes" ]]; then
        return 0
    else
        return 1
    fi
}

# Process log directory
process_log_directory() {
    local log_dir="$1"
    
    if [[ ! -d "$log_dir" ]]; then
        log "WARNING" "Log directory not found: $log_dir"
        return
    fi
    
    log "INFO" "Processing log directory: $log_dir"
    
    # Find log files and process them
    find "$log_dir" -name "*.log" -type f | while read -r log_file; do
        if needs_rotation "$log_file"; then
            log "INFO" "Rotating log file: $log_file"
            rotate_log_file "$log_file"
            
            # Reload services after log rotation
            reload_services_after_rotation "$log_file"
        fi
    done
    
    # Check directory size
    local dir_size
    dir_size=$(get_directory_size "$log_dir")
    
    if [[ "$dir_size" -gt 1000 ]]; then
        log "WARNING" "Log directory size is large: $log_dir ($dir_size MB)"
    fi
}

# Reload services after log rotation
reload_services_after_rotation() {
    local log_file="$1"
    
    # Reload nginx if nginx logs were rotated
    if [[ "$log_file" == *nginx* ]] && command_exists systemctl; then
        if systemctl is-active --quiet nginx; then
            systemctl reload nginx
            log "INFO" "Reloaded nginx after log rotation"
        fi
    fi
    
    # Send signal to application for log reopening
    if [[ "$log_file" == *echotune* ]] || [[ "$log_file" == *app* ]]; then
        # Try to find and signal the Node.js process
        local pid
        pid=$(pgrep -f "node.*index.js" | head -1)
        if [[ -n "$pid" ]]; then
            kill -USR1 "$pid" 2>/dev/null || true
            log "INFO" "Sent USR1 signal to application (PID: $pid)"
        fi
    fi
}

# Monitor disk usage
monitor_disk_usage() {
    log "INFO" "Monitoring disk usage..."
    
    for log_dir in $LOG_DIRS; do
        if [[ -d "$log_dir" ]]; then
            local usage
            usage=$(get_disk_usage "$log_dir")
            
            if [[ "$usage" -gt "$DISK_THRESHOLD" ]]; then
                local message="Disk usage high in $log_dir: ${usage}% (threshold: ${DISK_THRESHOLD}%)"
                log "WARNING" "$message"
                send_alert "DISK_USAGE" "$message"
            else
                log "INFO" "Disk usage OK in $log_dir: ${usage}%"
            fi
        fi
    done
}

# Monitor log growth
monitor_log_growth() {
    log "INFO" "Monitoring log file growth..."
    
    local growth_file="/tmp/echotune-log-sizes"
    local current_file="/tmp/echotune-log-sizes-current"
    
    # Collect current log sizes
    > "$current_file"
    
    for log_dir in $LOG_DIRS; do
        if [[ -d "$log_dir" ]]; then
            find "$log_dir" -name "*.log" -type f -exec stat -c "%s %n" {} \; >> "$current_file"
        fi
    done
    
    # Compare with previous sizes if available
    if [[ -f "$growth_file" ]]; then
        while read -r current_size current_file_path; do
            local previous_size
            previous_size=$(grep "$current_file_path" "$growth_file" | awk '{print $1}' || echo "0")
            
            if [[ -n "$previous_size" ]] && [[ "$previous_size" -gt 0 ]]; then
                local growth=$((current_size - previous_size))
                local growth_mb=$((growth / 1024 / 1024))
                
                if [[ "$growth_mb" -gt 100 ]]; then
                    local message="Rapid log growth detected: $current_file_path (+${growth_mb}MB)"
                    log "WARNING" "$message"
                    send_alert "LOG_GROWTH" "$message"
                fi
            fi
        done < "$current_file"
    fi
    
    # Save current sizes for next comparison
    cp "$current_file" "$growth_file"
}

# Send alert
send_alert() {
    local alert_type="$1"
    local message="$2"
    
    # Email alert
    if [[ -n "$ALERT_EMAIL" ]] && command_exists mail; then
        echo "$message" | mail -s "EchoTune AI Log Alert - $alert_type" "$ALERT_EMAIL"
        log "INFO" "Email alert sent: $alert_type"
    fi
    
    # Slack webhook
    if [[ -n "$SLACK_WEBHOOK" ]] && command_exists curl; then
        local payload
        payload=$(cat <<EOF
{
    "text": "🚨 EchoTune AI Log Alert",
    "attachments": [
        {
            "color": "warning",
            "fields": [
                {
                    "title": "Alert Type",
                    "value": "$alert_type",
                    "short": true
                },
                {
                    "title": "Message",
                    "value": "$message",
                    "short": false
                },
                {
                    "title": "Timestamp",
                    "value": "$(date)",
                    "short": true
                }
            ]
        }
    ]
}
EOF
        )
        
        curl -X POST -H 'Content-type: application/json' \
            --data "$payload" \
            "$SLACK_WEBHOOK" >/dev/null 2>&1
        
        log "INFO" "Slack alert sent: $alert_type"
    fi
}

# Setup logrotate configuration
setup_logrotate() {
    log "INFO" "Setting up logrotate configuration..."
    
    local logrotate_config="/etc/logrotate.d/echotune"
    
    cat > "$logrotate_config" << EOF
# EchoTune AI Log Rotation Configuration

# Application logs
/opt/echotune/logs/*.log {
    daily
    missingok
    rotate $MAX_LOG_FILES
    compress
    delaycompress
    notifempty
    create 644 echotune echotune
    postrotate
        # Signal application to reopen log files
        pkill -USR1 -f "node.*index.js" || true
    endscript
}

# Nginx logs (if not already configured)
/var/log/nginx/echotune_*.log {
    daily
    missingok
    rotate $MAX_LOG_FILES
    compress
    delaycompress
    notifempty
    create 644 nginx nginx
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
    endscript
}

# Custom application logs
/var/log/echotune/*.log {
    daily
    missingok
    rotate $MAX_LOG_FILES
    compress
    delaycompress
    notifempty
    create 644 root root
}
EOF
    
    # Test logrotate configuration
    if command_exists logrotate; then
        if logrotate -d "$logrotate_config" >/dev/null 2>&1; then
            log "INFO" "Logrotate configuration created successfully"
        else
            log "ERROR" "Logrotate configuration test failed"
        fi
    fi
}

# Setup cron jobs
setup_cron_jobs() {
    log "INFO" "Setting up cron jobs for log management..."
    
    local cron_file="/etc/cron.d/echotune-log-management"
    
    cat > "$cron_file" << EOF
# EchoTune AI Log Management Cron Jobs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Rotate logs every hour
0 * * * * root $SCRIPT_DIR/log-rotation.sh rotate

# Monitor logs every 30 minutes
*/30 * * * * root $SCRIPT_DIR/log-rotation.sh monitor

# Daily cleanup and maintenance
0 2 * * * root $SCRIPT_DIR/log-rotation.sh cleanup

# Weekly log analysis
0 3 * * 0 root $SCRIPT_DIR/log-rotation.sh analyze
EOF
    
    chmod 644 "$cron_file"
    log "INFO" "Cron jobs configured"
}

# Analyze logs for issues
analyze_logs() {
    log "INFO" "Analyzing logs for issues..."
    
    local analysis_report="/tmp/echotune-log-analysis-$(date +%Y%m%d).txt"
    
    {
        echo "EchoTune AI Log Analysis Report"
        echo "Generated: $(date)"
        echo "=================================="
        echo ""
        
        # Error analysis
        echo "ERROR ANALYSIS:"
        echo "---------------"
        
        for log_dir in $LOG_DIRS; do
            if [[ -d "$log_dir" ]]; then
                echo "Errors in $log_dir:"
                find "$log_dir" -name "*.log" -type f -exec grep -i "error" {} \; | \
                    sort | uniq -c | sort -nr | head -10
                echo ""
            fi
        done
        
        # Warning analysis
        echo "WARNING ANALYSIS:"
        echo "-----------------"
        
        for log_dir in $LOG_DIRS; do
            if [[ -d "$log_dir" ]]; then
                echo "Warnings in $log_dir:"
                find "$log_dir" -name "*.log" -type f -exec grep -i "warn" {} \; | \
                    sort | uniq -c | sort -nr | head -10
                echo ""
            fi
        done
        
        # Access patterns (for nginx logs)
        echo "ACCESS PATTERNS:"
        echo "----------------"
        
        if [[ -d "/var/log/nginx" ]]; then
            echo "Top IP addresses:"
            find /var/log/nginx -name "*access*.log" -type f -exec awk '{print $1}' {} \; | \
                sort | uniq -c | sort -nr | head -10
            echo ""
            
            echo "Top user agents:"
            find /var/log/nginx -name "*access*.log" -type f -exec awk -F'"' '{print $6}' {} \; | \
                sort | uniq -c | sort -nr | head -10
            echo ""
        fi
        
        # Disk usage summary
        echo "DISK USAGE SUMMARY:"
        echo "-------------------"
        
        for log_dir in $LOG_DIRS; do
            if [[ -d "$log_dir" ]]; then
                local size
                size=$(get_directory_size "$log_dir")
                local usage
                usage=$(get_disk_usage "$log_dir")
                echo "$log_dir: ${size}MB (${usage}% disk usage)"
            fi
        done
        
    } > "$analysis_report"
    
    log "INFO" "Log analysis completed: $analysis_report"
    
    # Send analysis report if configured
    if [[ -n "$ALERT_EMAIL" ]] && command_exists mail; then
        mail -s "EchoTune AI Weekly Log Analysis" "$ALERT_EMAIL" < "$analysis_report"
        log "INFO" "Analysis report sent via email"
    fi
}

# Cleanup old logs and temporary files
cleanup_logs() {
    log "INFO" "Cleaning up old logs and temporary files..."
    
    # Remove old compressed logs beyond retention
    for log_dir in $LOG_DIRS; do
        if [[ -d "$log_dir" ]]; then
            # Remove logs older than 30 days
            find "$log_dir" -name "*.log.gz" -type f -mtime +30 -delete 2>/dev/null || true
            
            # Remove empty log files
            find "$log_dir" -name "*.log" -type f -empty -delete 2>/dev/null || true
        fi
    done
    
    # Clean up temporary files
    find /tmp -name "echotune-*" -type f -mtime +7 -delete 2>/dev/null || true
    
    log "INFO" "Cleanup completed"
}

# Main functions
rotate_logs() {
    log "INFO" "Starting log rotation..."
    
    for log_dir in $LOG_DIRS; do
        process_log_directory "$log_dir"
    done
    
    log "INFO" "Log rotation completed"
}

monitor_logs() {
    log "INFO" "Starting log monitoring..."
    
    monitor_disk_usage
    monitor_log_growth
    
    log "INFO" "Log monitoring completed"
}

# Show help
show_help() {
    cat << EOF
EchoTune AI Log Rotation and Monitoring Script

Usage: $0 <command> [options]

Commands:
    rotate              Rotate log files if they exceed size limits
    monitor             Monitor disk usage and log growth
    analyze             Analyze logs for errors and patterns
    cleanup             Clean up old logs and temporary files
    setup               Setup logrotate and cron jobs
    help                Show this help message

Environment Variables:
    LOG_DIRS            Log directories to process (space-separated)
    MAX_LOG_SIZE        Maximum log file size before rotation (default: 100M)
    MAX_LOG_FILES       Number of rotated files to keep (default: 10)
    COMPRESS_LOGS       Compress rotated logs (default: true)
    DISK_THRESHOLD      Disk usage alert threshold % (default: 90)
    ALERT_EMAIL         Email for alerts
    SLACK_WEBHOOK       Slack webhook for alerts

Examples:
    $0 rotate           # Rotate log files
    $0 monitor          # Monitor logs and disk usage
    $0 setup            # Setup automated log management

EOF
}

# Main execution
main() {
    case "${1:-help}" in
        "rotate")
            rotate_logs
            ;;
        "monitor")
            monitor_logs
            ;;
        "analyze")
            analyze_logs
            ;;
        "cleanup")
            cleanup_logs
            ;;
        "setup")
            setup_logrotate
            setup_cron_jobs
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log "ERROR" "Unknown command: ${1:-}"
            show_help
            exit 1
            ;;
    esac
}

# Create log directory for this script
mkdir -p "$(dirname "$LOG_MONITOR_LOG")"

# Execute main function with all arguments
main "$@"