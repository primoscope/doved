#!/bin/bash

# EchoTune AI - Automated Backup System
# Comprehensive backup solution for application data, configuration, and databases

set -e

# Configuration
APP_DIR="/opt/echotune"
BACKUP_BASE_DIR="${APP_DIR}/backups"
LOG_DIR="${APP_DIR}/logs"
BACKUP_LOG="$LOG_DIR/backup.log"

# Backup settings
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
COMPRESS_BACKUPS=${COMPRESS_BACKUPS:-true}
REMOTE_BACKUP=${REMOTE_BACKUP:-false}
REMOTE_BACKUP_PATH=${REMOTE_BACKUP_PATH:-""}

# Database settings
MONGODB_URI=${MONGODB_URI:-""}
REDIS_URL=${REDIS_URL:-""}

# S3 settings (optional)
AWS_S3_BUCKET=${AWS_S3_BUCKET:-""}
AWS_REGION=${AWS_REGION:-"us-east-1"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
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
    
    echo -e "${color}[$timestamp] [$level]${NC} $message" | tee -a "$BACKUP_LOG"
}

# Check prerequisites
check_prerequisites() {
    log_message "INFO" "Checking backup prerequisites..."
    
    # Check required directories
    mkdir -p "$BACKUP_BASE_DIR" "$LOG_DIR"
    
    # Check disk space (require at least 2GB free)
    local available_space=$(df "$BACKUP_BASE_DIR" | tail -1 | awk '{print $4}')
    local available_gb=$((available_space / 1024 / 1024))
    
    if [ "$available_gb" -lt 2 ]; then
        log_message "ERROR" "Insufficient disk space for backup (${available_gb}GB available, 2GB required)"
        exit 1
    fi
    
    log_message "SUCCESS" "Prerequisites check passed - ${available_gb}GB available"
}

# Create backup directory structure
create_backup_structure() {
    local backup_timestamp="$1"
    local backup_dir="$BACKUP_BASE_DIR/$backup_timestamp"
    
    mkdir -p "$backup_dir"/{config,data,logs,ssl,scripts}
    echo "$backup_dir"
}

# Backup application configuration
backup_configuration() {
    local backup_dir="$1"
    
    log_message "INFO" "Backing up application configuration..."
    
    cd "$APP_DIR" || exit 1
    
    # Backup configuration files
    if [ -f ".env" ]; then
        # Create sanitized version without sensitive data
        grep -v -E "(CLIENT_SECRET|PASSWORD|KEY|TOKEN)" .env > "$backup_dir/config/env_sanitized" 2>/dev/null || true
        # Create encrypted backup of full .env
        if command -v gpg &> /dev/null; then
            gpg --symmetric --cipher-algo AES256 --output "$backup_dir/config/env_encrypted.gpg" .env 2>/dev/null || \
            cp .env "$backup_dir/config/env_full" 2>/dev/null || true
        else
            cp .env "$backup_dir/config/env_full" 2>/dev/null || true
        fi
    fi
    
    # Backup other configuration files
    for config_file in docker-compose.yml nginx.conf package.json package-lock.json; do
        if [ -f "$config_file" ]; then
            cp "$config_file" "$backup_dir/config/" 2>/dev/null || true
        fi
    done
    
    # Backup production configuration
    if [ -f ".env.production.example" ]; then
        cp .env.production.example "$backup_dir/config/" 2>/dev/null || true
    fi
    
    log_message "SUCCESS" "Configuration backup completed"
}

# Backup SSL certificates
backup_ssl_certificates() {
    local backup_dir="$1"
    
    log_message "INFO" "Backing up SSL certificates..."
    
    if [ -d "$APP_DIR/ssl" ] && [ "$(ls -A $APP_DIR/ssl)" ]; then
        cp -r "$APP_DIR/ssl"/* "$backup_dir/ssl/" 2>/dev/null || true
        log_message "SUCCESS" "SSL certificates backed up"
    else
        log_message "WARNING" "No SSL certificates found to backup"
    fi
}

# Backup application scripts
backup_scripts() {
    local backup_dir="$1"
    
    log_message "INFO" "Backing up application scripts..."
    
    if [ -d "$APP_DIR/scripts" ]; then
        cp -r "$APP_DIR/scripts"/* "$backup_dir/scripts/" 2>/dev/null || true
        log_message "SUCCESS" "Application scripts backed up"
    else
        log_message "WARNING" "No scripts directory found"
    fi
}

# Backup application logs
backup_logs() {
    local backup_dir="$1"
    
    log_message "INFO" "Backing up application logs..."
    
    # Backup recent logs (last 7 days)
    find "$LOG_DIR" -name "*.log" -mtime -7 -exec cp {} "$backup_dir/logs/" \; 2>/dev/null || true
    
    # Backup Docker logs
    if command -v docker &> /dev/null; then
        cd "$APP_DIR" || exit 1
        for container in $(docker-compose ps -q 2>/dev/null || true); do
            if [ -n "$container" ]; then
                local container_name=$(docker inspect --format='{{.Name}}' "$container" | sed 's/^.//')
                docker logs "$container" --since 7d > "$backup_dir/logs/${container_name}_docker.log" 2>/dev/null || true
            fi
        done
    fi
    
    log_message "SUCCESS" "Application logs backed up"
}

# Backup MongoDB data
backup_mongodb() {
    local backup_dir="$1"
    
    if [ -z "$MONGODB_URI" ]; then
        log_message "INFO" "No MongoDB URI configured, skipping MongoDB backup"
        return 0
    fi
    
    log_message "INFO" "Backing up MongoDB data..."
    
    # Use mongodump if available
    if command -v mongodump &> /dev/null; then
        local mongo_backup_dir="$backup_dir/data/mongodb"
        mkdir -p "$mongo_backup_dir"
        
        if mongodump --uri="$MONGODB_URI" --out="$mongo_backup_dir" 2>/dev/null; then
            log_message "SUCCESS" "MongoDB backup completed using mongodump"
        else
            log_message "ERROR" "MongoDB backup failed with mongodump"
            return 1
        fi
    else
        # Alternative: Use Docker if mongodump is not available
        if command -v docker &> /dev/null; then
            local mongo_backup_dir="$backup_dir/data/mongodb"
            mkdir -p "$mongo_backup_dir"
            
            if docker run --rm -v "$mongo_backup_dir:/backup" mongo:latest mongodump --uri="$MONGODB_URI" --out=/backup 2>/dev/null; then
                log_message "SUCCESS" "MongoDB backup completed using Docker"
            else
                log_message "WARNING" "MongoDB backup failed with Docker"
            fi
        else
            log_message "WARNING" "Neither mongodump nor Docker available for MongoDB backup"
        fi
    fi
}

# Backup Redis data
backup_redis() {
    local backup_dir="$1"
    
    if [ -z "$REDIS_URL" ]; then
        log_message "INFO" "No Redis URL configured, skipping Redis backup"
        return 0
    fi
    
    log_message "INFO" "Backing up Redis data..."
    
    local redis_backup_dir="$backup_dir/data/redis"
    mkdir -p "$redis_backup_dir"
    
    # Try to create Redis backup
    if command -v redis-cli &> /dev/null; then
        if redis-cli -u "$REDIS_URL" --rdb "$redis_backup_dir/dump.rdb" 2>/dev/null; then
            log_message "SUCCESS" "Redis backup completed"
        else
            log_message "WARNING" "Redis backup failed"
        fi
    else
        log_message "WARNING" "redis-cli not available for Redis backup"
    fi
}

# Backup application data files
backup_application_data() {
    local backup_dir="$1"
    
    log_message "INFO" "Backing up application data files..."
    
    # Backup data directory if it exists
    if [ -d "$APP_DIR/data" ]; then
        cp -r "$APP_DIR/data" "$backup_dir/data/app_data" 2>/dev/null || true
        log_message "SUCCESS" "Application data directory backed up"
    fi
    
    # Backup any CSV files or datasets
    find "$APP_DIR" -name "*.csv" -o -name "*.json" -o -name "*.sqlite" -o -name "*.db" | while read -r file; do
        if [ -f "$file" ]; then
            local relative_path=${file#$APP_DIR/}
            local target_dir="$backup_dir/data/$(dirname "$relative_path")"
            mkdir -p "$target_dir"
            cp "$file" "$target_dir/" 2>/dev/null || true
        fi
    done
}

# Compress backup if enabled
compress_backup() {
    local backup_dir="$1"
    local backup_timestamp="$2"
    
    if [ "$COMPRESS_BACKUPS" = "true" ]; then
        log_message "INFO" "Compressing backup..."
        
        cd "$BACKUP_BASE_DIR" || exit 1
        
        if tar -czf "${backup_timestamp}.tar.gz" "$backup_timestamp" 2>/dev/null; then
            rm -rf "$backup_timestamp"
            log_message "SUCCESS" "Backup compressed to ${backup_timestamp}.tar.gz"
            echo "${BACKUP_BASE_DIR}/${backup_timestamp}.tar.gz"
        else
            log_message "ERROR" "Backup compression failed"
            echo "$backup_dir"
        fi
    else
        echo "$backup_dir"
    fi
}

# Upload backup to remote location
upload_to_remote() {
    local backup_path="$1"
    local backup_name=$(basename "$backup_path")
    
    if [ "$REMOTE_BACKUP" != "true" ]; then
        return 0
    fi
    
    log_message "INFO" "Uploading backup to remote location..."
    
    # S3 upload
    if [ -n "$AWS_S3_BUCKET" ] && command -v aws &> /dev/null; then
        if aws s3 cp "$backup_path" "s3://$AWS_S3_BUCKET/echotune-backups/$backup_name" --region "$AWS_REGION" 2>/dev/null; then
            log_message "SUCCESS" "Backup uploaded to S3: s3://$AWS_S3_BUCKET/echotune-backups/$backup_name"
        else
            log_message "ERROR" "Failed to upload backup to S3"
        fi
    fi
    
    # SCP upload
    if [ -n "$REMOTE_BACKUP_PATH" ]; then
        if scp "$backup_path" "$REMOTE_BACKUP_PATH" 2>/dev/null; then
            log_message "SUCCESS" "Backup uploaded via SCP to $REMOTE_BACKUP_PATH"
        else
            log_message "ERROR" "Failed to upload backup via SCP"
        fi
    fi
}

# Clean old backups
clean_old_backups() {
    log_message "INFO" "Cleaning old backups (retention: $RETENTION_DAYS days)..."
    
    # Clean local backups
    find "$BACKUP_BASE_DIR" -type f -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_BASE_DIR" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
    
    # Clean S3 backups if configured
    if [ -n "$AWS_S3_BUCKET" ] && command -v aws &> /dev/null; then
        local cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
        aws s3 ls "s3://$AWS_S3_BUCKET/echotune-backups/" | while read -r line; do
            local file_date=$(echo "$line" | awk '{print $1}')
            local file_name=$(echo "$line" | awk '{print $4}')
            if [ "$file_date" \< "$cutoff_date" ] && [ -n "$file_name" ]; then
                aws s3 rm "s3://$AWS_S3_BUCKET/echotune-backups/$file_name" 2>/dev/null || true
                log_message "INFO" "Removed old S3 backup: $file_name"
            fi
        done
    fi
    
    log_message "SUCCESS" "Old backup cleanup completed"
}

# Generate backup manifest
generate_backup_manifest() {
    local backup_dir="$1"
    local backup_timestamp="$2"
    
    local manifest_file="$backup_dir/BACKUP_MANIFEST.txt"
    
    cat > "$manifest_file" <<EOF
EchoTune AI Backup Manifest
===========================
Backup Date: $(date)
Backup ID: $backup_timestamp
Server: $(hostname)
IP Address: $(curl -s https://ipinfo.io/ip 2>/dev/null || echo "Unknown")

Backup Contents:
$(find "$backup_dir" -type f | sort)

System Information:
OS: $(lsb_release -d 2>/dev/null | cut -f2 || uname -a)
Uptime: $(uptime)
Disk Usage: $(df -h /)

Application Status:
$(docker-compose ps 2>/dev/null || echo "Docker Compose not available")

Git Information:
$(cd "$APP_DIR" && git log -1 --oneline 2>/dev/null || echo "Not a git repository")

Environment Variables (sanitized):
$(grep -v -E "(SECRET|PASSWORD|KEY|TOKEN)" "$APP_DIR/.env" 2>/dev/null || echo "No .env file")
EOF
    
    log_message "SUCCESS" "Backup manifest generated"
}

# Main backup function
perform_backup() {
    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    
    log_message "INFO" "Starting backup process - ID: $backup_timestamp"
    
    # Check prerequisites
    check_prerequisites
    
    # Create backup directory structure
    local backup_dir=$(create_backup_structure "$backup_timestamp")
    
    # Perform individual backup tasks
    backup_configuration "$backup_dir"
    backup_ssl_certificates "$backup_dir"
    backup_scripts "$backup_dir"
    backup_logs "$backup_dir"
    backup_mongodb "$backup_dir"
    backup_redis "$backup_dir"
    backup_application_data "$backup_dir"
    
    # Generate manifest
    generate_backup_manifest "$backup_dir" "$backup_timestamp"
    
    # Compress backup
    local final_backup_path=$(compress_backup "$backup_dir" "$backup_timestamp")
    
    # Upload to remote location
    upload_to_remote "$final_backup_path"
    
    # Clean old backups
    clean_old_backups
    
    # Calculate backup size
    local backup_size
    if [ -f "$final_backup_path" ]; then
        backup_size=$(du -sh "$final_backup_path" | cut -f1)
    else
        backup_size=$(du -sh "$final_backup_path" | cut -f1)
    fi
    
    log_message "SUCCESS" "Backup completed successfully"
    log_message "INFO" "Backup location: $final_backup_path"
    log_message "INFO" "Backup size: $backup_size"
    
    return 0
}

# Restore function (basic implementation)
restore_backup() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
        log_message "ERROR" "Backup file not found: $backup_file"
        exit 1
    fi
    
    log_message "WARNING" "Starting restore process from: $backup_file"
    log_message "WARNING" "This will overwrite current configuration and data"
    
    read -p "Are you sure you want to continue? (yes/no): " -r confirm
    if [ "$confirm" != "yes" ]; then
        log_message "INFO" "Restore cancelled by user"
        exit 0
    fi
    
    # Create restore directory
    local restore_dir="/tmp/echotune_restore_$(date +%s)"
    mkdir -p "$restore_dir"
    
    # Extract backup
    if [[ "$backup_file" == *.tar.gz ]]; then
        tar -xzf "$backup_file" -C "$restore_dir"
    else
        cp -r "$backup_file"/* "$restore_dir/"
    fi
    
    # Restore configuration
    if [ -d "$restore_dir/config" ]; then
        cp "$restore_dir/config"/*.env* "$APP_DIR/" 2>/dev/null || true
        cp "$restore_dir/config"/docker-compose.yml "$APP_DIR/" 2>/dev/null || true
        cp "$restore_dir/config"/nginx.conf "$APP_DIR/" 2>/dev/null || true
    fi
    
    # Restore SSL certificates
    if [ -d "$restore_dir/ssl" ]; then
        mkdir -p "$APP_DIR/ssl"
        cp "$restore_dir/ssl"/* "$APP_DIR/ssl/" 2>/dev/null || true
    fi
    
    log_message "SUCCESS" "Basic restore completed. Manual verification recommended."
    
    # Cleanup
    rm -rf "$restore_dir"
}

# Handle command line arguments
case "${1:-backup}" in
    "backup")
        # Source environment variables
        if [ -f "$APP_DIR/.env" ]; then
            set -a
            source "$APP_DIR/.env"
            set +a
        fi
        
        perform_backup
        ;;
    "restore")
        restore_backup "$2"
        ;;
    "list")
        log_message "INFO" "Available backups:"
        ls -la "$BACKUP_BASE_DIR"/*.tar.gz 2>/dev/null || log_message "INFO" "No compressed backups found"
        ls -la "$BACKUP_BASE_DIR"/2* 2>/dev/null || log_message "INFO" "No uncompressed backups found"
        ;;
    "clean")
        clean_old_backups
        ;;
    *)
        echo "Usage: $0 [backup|restore <file>|list|clean]"
        echo "  backup - Create a new backup (default)"
        echo "  restore <file> - Restore from backup file"
        echo "  list - List available backups"
        echo "  clean - Clean old backups"
        exit 1
        ;;
esac