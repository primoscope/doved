#!/bin/bash

# Backup and Maintenance Script for EchoTune AI
# Comprehensive backup, restore, and maintenance operations

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_LOG="/var/log/echotune-backup.log"

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
fi

# Default configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/echotune/backups}"
REMOTE_BACKUP="${REMOTE_BACKUP:-false}"
AWS_S3_BUCKET="${AWS_S3_BUCKET:-}"
REMOTE_BACKUP_PATH="${REMOTE_BACKUP_PATH:-}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_COMPRESSION="${BACKUP_COMPRESSION:-true}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# Backup paths
APP_DIR="/opt/echotune"
CONFIG_DIRS="/etc/nginx /etc/ssl /etc/systemd/system/echotune.service"
LOG_DIRS="/var/log/nginx /var/log/echotune"
DATABASE_BACKUP_DIR="$BACKUP_DIR/database"
FILES_BACKUP_DIR="$BACKUP_DIR/files"

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
    
    echo "[$timestamp] [$level] $message" | tee -a "$BACKUP_LOG"
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

# Send notification
send_notification() {
    local title="$1"
    local message="$2"
    local status="${3:-INFO}"
    
    # Email notification
    if [[ -n "$ALERT_EMAIL" ]] && command_exists mail; then
        echo "$message" | mail -s "EchoTune AI Backup - $title" "$ALERT_EMAIL"
        log "INFO" "Email notification sent: $title"
    fi
    
    # Slack notification
    if [[ -n "$SLACK_WEBHOOK" ]] && command_exists curl; then
        local color="good"
        local emoji="✅"
        
        case "$status" in
            "ERROR")
                color="danger"
                emoji="❌"
                ;;
            "WARNING")
                color="warning"
                emoji="⚠️"
                ;;
        esac
        
        local payload
        payload=$(cat <<EOF
{
    "text": "$emoji EchoTune AI Backup Notification",
    "attachments": [
        {
            "color": "$color",
            "fields": [
                {
                    "title": "$title",
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
        
        log "INFO" "Slack notification sent: $title"
    fi
}

# Create backup directory structure
create_backup_dirs() {
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$DATABASE_BACKUP_DIR"
    mkdir -p "$FILES_BACKUP_DIR"
    mkdir -p "$(dirname "$BACKUP_LOG")"
    
    log "INFO" "Backup directories created"
}

# Generate backup filename
generate_backup_filename() {
    local backup_type="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local hostname=$(hostname -s)
    
    echo "${backup_type}-${hostname}-${timestamp}"
}

# Backup application files
backup_application_files() {
    print_status "INFO" "Backing up application files..."
    
    local backup_name
    backup_name=$(generate_backup_filename "app-files")
    local backup_file="$FILES_BACKUP_DIR/${backup_name}.tar"
    
    # Create backup
    if [[ -d "$APP_DIR" ]]; then
        tar -cf "$backup_file" -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" 2>/dev/null
        
        # Add configuration files
        for config_dir in $CONFIG_DIRS; do
            if [[ -e "$config_dir" ]]; then
                tar -rf "$backup_file" -C / "${config_dir#/}" 2>/dev/null || true
            fi
        done
        
        # Compress if enabled
        if [[ "$BACKUP_COMPRESSION" == "true" ]]; then
            gzip "$backup_file"
            backup_file="${backup_file}.gz"
        fi
        
        local size
        size=$(du -h "$backup_file" | cut -f1)
        
        print_status "SUCCESS" "Application files backup completed: $backup_file ($size)"
        log "INFO" "Application files backed up: $backup_file"
        
        echo "$backup_file"
    else
        print_status "WARNING" "Application directory not found: $APP_DIR"
        echo ""
    fi
}

# Backup database
backup_database() {
    print_status "INFO" "Backing up database..."
    
    local backup_name
    backup_name=$(generate_backup_filename "database")
    local success=false
    
    # MongoDB backup
    if [[ -n "${MONGODB_URI:-}" ]]; then
        local mongo_backup="$DATABASE_BACKUP_DIR/${backup_name}-mongodb"
        
        if command_exists mongodump; then
            if mongodump --uri="$MONGODB_URI" --out="$mongo_backup" 2>/dev/null; then
                if [[ "$BACKUP_COMPRESSION" == "true" ]]; then
                    tar -czf "${mongo_backup}.tar.gz" -C "$DATABASE_BACKUP_DIR" "$(basename "$mongo_backup")"
                    rm -rf "$mongo_backup"
                    mongo_backup="${mongo_backup}.tar.gz"
                fi
                
                local size
                size=$(du -h "$mongo_backup" | cut -f1)
                print_status "SUCCESS" "MongoDB backup completed: $mongo_backup ($size)"
                log "INFO" "MongoDB backed up: $mongo_backup"
                success=true
            else
                print_status "ERROR" "MongoDB backup failed"
                log "ERROR" "MongoDB backup failed"
            fi
        else
            print_status "WARNING" "mongodump not available, skipping MongoDB backup"
        fi
    fi
    
    # PostgreSQL backup (Supabase)
    if [[ -n "${DATABASE_URL:-}" ]]; then
        local pg_backup="$DATABASE_BACKUP_DIR/${backup_name}-postgresql.sql"
        
        if command_exists pg_dump; then
            if pg_dump "$DATABASE_URL" > "$pg_backup" 2>/dev/null; then
                if [[ "$BACKUP_COMPRESSION" == "true" ]]; then
                    gzip "$pg_backup"
                    pg_backup="${pg_backup}.gz"
                fi
                
                local size
                size=$(du -h "$pg_backup" | cut -f1)
                print_status "SUCCESS" "PostgreSQL backup completed: $pg_backup ($size)"
                log "INFO" "PostgreSQL backed up: $pg_backup"
                success=true
            else
                print_status "ERROR" "PostgreSQL backup failed"
                log "ERROR" "PostgreSQL backup failed"
            fi
        else
            print_status "WARNING" "pg_dump not available, skipping PostgreSQL backup"
        fi
    fi
    
    if [[ "$success" == "false" ]]; then
        print_status "WARNING" "No databases configured or available for backup"
    fi
}

# Backup logs
backup_logs() {
    print_status "INFO" "Backing up log files..."
    
    local backup_name
    backup_name=$(generate_backup_filename "logs")
    local backup_file="$FILES_BACKUP_DIR/${backup_name}.tar"
    
    # Create logs backup
    local has_logs=false
    
    for log_dir in $LOG_DIRS; do
        if [[ -d "$log_dir" ]]; then
            if [[ "$has_logs" == "false" ]]; then
                tar -cf "$backup_file" -C / "${log_dir#/}" 2>/dev/null
                has_logs=true
            else
                tar -rf "$backup_file" -C / "${log_dir#/}" 2>/dev/null
            fi
        fi
    done
    
    if [[ "$has_logs" == "true" ]]; then
        # Compress if enabled
        if [[ "$BACKUP_COMPRESSION" == "true" ]]; then
            gzip "$backup_file"
            backup_file="${backup_file}.gz"
        fi
        
        local size
        size=$(du -h "$backup_file" | cut -f1)
        
        print_status "SUCCESS" "Logs backup completed: $backup_file ($size)"
        log "INFO" "Logs backed up: $backup_file"
        
        echo "$backup_file"
    else
        print_status "WARNING" "No log directories found for backup"
        echo ""
    fi
}

# Upload to remote storage
upload_to_remote() {
    local backup_file="$1"
    
    if [[ "$REMOTE_BACKUP" != "true" ]]; then
        return 0
    fi
    
    print_status "INFO" "Uploading to remote storage..."
    
    # AWS S3 upload
    if [[ -n "$AWS_S3_BUCKET" ]] && command_exists aws; then
        local s3_path="s3://$AWS_S3_BUCKET/echotune-backups/$(basename "$backup_file")"
        
        if aws s3 cp "$backup_file" "$s3_path" 2>/dev/null; then
            print_status "SUCCESS" "Uploaded to S3: $s3_path"
            log "INFO" "Backup uploaded to S3: $s3_path"
        else
            print_status "ERROR" "S3 upload failed"
            log "ERROR" "S3 upload failed for: $backup_file"
        fi
    fi
    
    # SCP upload
    if [[ -n "$REMOTE_BACKUP_PATH" ]] && command_exists scp; then
        if scp "$backup_file" "$REMOTE_BACKUP_PATH/" 2>/dev/null; then
            print_status "SUCCESS" "Uploaded via SCP: $REMOTE_BACKUP_PATH"
            log "INFO" "Backup uploaded via SCP: $backup_file"
        else
            print_status "ERROR" "SCP upload failed"
            log "ERROR" "SCP upload failed for: $backup_file"
        fi
    fi
}

# Clean old backups
clean_old_backups() {
    print_status "INFO" "Cleaning old backups..."
    
    local deleted_count=0
    
    # Clean local backups
    if [[ -d "$BACKUP_DIR" ]]; then
        while IFS= read -r -d '' backup_file; do
            rm "$backup_file"
            ((deleted_count++))
        done < <(find "$BACKUP_DIR" -name "*.tar*" -o -name "*.sql*" -type f -mtime +"$BACKUP_RETENTION_DAYS" -print0 2>/dev/null)
    fi
    
    # Clean remote S3 backups
    if [[ -n "$AWS_S3_BUCKET" ]] && command_exists aws; then
        local cutoff_date
        cutoff_date=$(date -d "${BACKUP_RETENTION_DAYS} days ago" +%Y-%m-%d)
        
        aws s3 ls "s3://$AWS_S3_BUCKET/echotune-backups/" 2>/dev/null | \
        awk -v cutoff="$cutoff_date" '$1 < cutoff {print $4}' | \
        while read -r file; do
            if [[ -n "$file" ]]; then
                aws s3 rm "s3://$AWS_S3_BUCKET/echotune-backups/$file" 2>/dev/null
                ((deleted_count++))
            fi
        done
    fi
    
    if [[ "$deleted_count" -gt 0 ]]; then
        print_status "SUCCESS" "Cleaned $deleted_count old backup files"
        log "INFO" "Cleaned $deleted_count old backup files"
    else
        print_status "INFO" "No old backup files to clean"
    fi
}

# Restore from backup
restore_from_backup() {
    local backup_file="$1"
    local restore_type="${2:-full}"
    
    if [[ ! -f "$backup_file" ]]; then
        print_status "ERROR" "Backup file not found: $backup_file"
        return 1
    fi
    
    print_status "INFO" "Restoring from backup: $backup_file"
    
    # Create restore directory
    local restore_dir="/tmp/echotune-restore-$$"
    mkdir -p "$restore_dir"
    
    # Extract backup
    cd "$restore_dir"
    
    if [[ "$backup_file" == *.gz ]]; then
        tar -xzf "$backup_file"
    else
        tar -xf "$backup_file"
    fi
    
    # Stop services before restore
    print_status "INFO" "Stopping services for restore..."
    systemctl stop echotune 2>/dev/null || true
    systemctl stop nginx 2>/dev/null || true
    
    # Restore application files
    if [[ "$restore_type" == "full" ]] || [[ "$restore_type" == "app" ]]; then
        if [[ -d "$restore_dir/echotune" ]]; then
            # Backup current installation
            if [[ -d "$APP_DIR" ]]; then
                mv "$APP_DIR" "${APP_DIR}.backup.$(date +%s)"
            fi
            
            # Restore from backup
            cp -r "$restore_dir/echotune" "$APP_DIR"
            chown -R echotune:echotune "$APP_DIR" 2>/dev/null || true
            
            print_status "SUCCESS" "Application files restored"
        fi
    fi
    
    # Restore configuration files
    if [[ "$restore_type" == "full" ]] || [[ "$restore_type" == "config" ]]; then
        for config_dir in $CONFIG_DIRS; do
            local config_name
            config_name=$(basename "$config_dir")
            
            if [[ -d "$restore_dir/$config_name" ]] || [[ -f "$restore_dir/$config_name" ]]; then
                # Backup current config
                if [[ -e "$config_dir" ]]; then
                    mv "$config_dir" "${config_dir}.backup.$(date +%s)"
                fi
                
                # Restore from backup
                cp -r "$restore_dir/$config_name" "$config_dir"
                
                print_status "SUCCESS" "Configuration restored: $config_dir"
            fi
        done
    fi
    
    # Start services after restore
    print_status "INFO" "Starting services after restore..."
    systemctl daemon-reload 2>/dev/null || true
    systemctl start echotune 2>/dev/null || true
    systemctl start nginx 2>/dev/null || true
    
    # Cleanup
    rm -rf "$restore_dir"
    
    print_status "SUCCESS" "Restore completed from: $backup_file"
    log "INFO" "Restore completed from: $backup_file"
}

# List available backups
list_backups() {
    print_status "INFO" "Available backups:"
    
    echo ""
    echo "Local Backups:"
    echo "--------------"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        find "$BACKUP_DIR" -name "*.tar*" -o -name "*.sql*" -type f | \
        while read -r backup_file; do
            local size
            size=$(du -h "$backup_file" | cut -f1)
            local date
            date=$(date -r "$backup_file" '+%Y-%m-%d %H:%M:%S')
            printf "%-60s %8s %s\n" "$(basename "$backup_file")" "$size" "$date"
        done | sort -k3,3r
    else
        echo "No local backups found"
    fi
    
    echo ""
    echo "Remote S3 Backups:"
    echo "------------------"
    
    if [[ -n "$AWS_S3_BUCKET" ]] && command_exists aws; then
        aws s3 ls "s3://$AWS_S3_BUCKET/echotune-backups/" 2>/dev/null | \
        awk '{printf "%-60s %8s %s %s\n", $4, $3, $1, $2}' | sort -k3,3r
    else
        echo "S3 not configured or aws CLI not available"
    fi
    
    echo ""
}

# System maintenance
system_maintenance() {
    print_status "INFO" "Performing system maintenance..."
    
    # Update package lists (if system supports it)
    if command_exists apt-get; then
        apt-get update >/dev/null 2>&1 || true
    elif command_exists yum; then
        yum check-update >/dev/null 2>&1 || true
    fi
    
    # Clean up Docker if used
    if command_exists docker; then
        # Remove unused containers, networks, images
        docker system prune -f >/dev/null 2>&1 || true
        
        # Remove unused volumes
        docker volume prune -f >/dev/null 2>&1 || true
        
        print_status "SUCCESS" "Docker cleanup completed"
    fi
    
    # Clean up temporary files
    find /tmp -name "echotune-*" -type f -mtime +7 -delete 2>/dev/null || true
    find /tmp -name "core.*" -type f -mtime +7 -delete 2>/dev/null || true
    
    # Clean up old log files
    find /var/log -name "*.log.*.gz" -type f -mtime +30 -delete 2>/dev/null || true
    
    # Check and repair file permissions
    if [[ -d "$APP_DIR" ]]; then
        chown -R echotune:echotune "$APP_DIR" 2>/dev/null || true
        find "$APP_DIR" -type f -exec chmod 644 {} \; 2>/dev/null || true
        find "$APP_DIR" -type d -exec chmod 755 {} \; 2>/dev/null || true
        find "$APP_DIR/scripts" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
    fi
    
    print_status "SUCCESS" "System maintenance completed"
}

# Full backup operation
full_backup() {
    local start_time=$(date +%s)
    
    print_status "INFO" "Starting full backup operation..."
    log "INFO" "Full backup started"
    
    create_backup_dirs
    
    # Backup components
    local app_backup
    app_backup=$(backup_application_files)
    
    backup_database
    
    local logs_backup
    logs_backup=$(backup_logs)
    
    # Upload to remote storage
    if [[ -n "$app_backup" ]]; then
        upload_to_remote "$app_backup"
    fi
    
    if [[ -n "$logs_backup" ]]; then
        upload_to_remote "$logs_backup"
    fi
    
    # Clean old backups
    clean_old_backups
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    print_status "SUCCESS" "Full backup completed in ${duration}s"
    log "INFO" "Full backup completed in ${duration}s"
    
    # Send success notification
    local backup_size
    backup_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "Unknown")
    
    send_notification "Backup Completed" \
        "Full backup completed successfully in ${duration}s. Total backup size: $backup_size" \
        "SUCCESS"
}

# Show help
show_help() {
    cat << EOF
EchoTune AI Backup and Maintenance Script

Usage: $0 <command> [options]

Commands:
    backup              Perform full backup (default)
    backup-app          Backup application files only
    backup-db           Backup database only
    backup-logs         Backup log files only
    restore <file>      Restore from backup file
    list                List available backups
    clean               Clean old backups
    maintenance         Perform system maintenance
    help                Show this help message

Restore Types:
    restore <file> full    Restore everything (default)
    restore <file> app     Restore application files only
    restore <file> config  Restore configuration files only

Environment Variables:
    BACKUP_DIR              Backup directory (default: /opt/echotune/backups)
    BACKUP_RETENTION_DAYS   Days to keep backups (default: 30)
    BACKUP_COMPRESSION      Compress backups (default: true)
    REMOTE_BACKUP           Enable remote backup (default: false)
    AWS_S3_BUCKET          S3 bucket for remote backup
    REMOTE_BACKUP_PATH     SCP path for remote backup
    ALERT_EMAIL            Email for notifications
    SLACK_WEBHOOK          Slack webhook for notifications

Examples:
    $0 backup              # Full backup
    $0 backup-app          # Application files only
    $0 restore /path/to/backup.tar.gz
    $0 list                # List available backups
    $0 maintenance         # System maintenance

EOF
}

# Main execution
main() {
    case "${1:-backup}" in
        "backup"|"full-backup")
            full_backup
            ;;
        "backup-app")
            create_backup_dirs
            backup_application_files
            ;;
        "backup-db")
            create_backup_dirs
            backup_database
            ;;
        "backup-logs")
            create_backup_dirs
            backup_logs
            ;;
        "restore")
            if [[ -z "${2:-}" ]]; then
                print_status "ERROR" "Backup file required for restore"
                show_help
                exit 1
            fi
            restore_from_backup "$2" "${3:-full}"
            ;;
        "list")
            list_backups
            ;;
        "clean")
            clean_old_backups
            ;;
        "maintenance")
            system_maintenance
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            print_status "ERROR" "Unknown command: ${1:-}"
            show_help
            exit 1
            ;;
    esac
}

# Create log directory
mkdir -p "$(dirname "$BACKUP_LOG")"

# Execute main function with all arguments
main "$@"