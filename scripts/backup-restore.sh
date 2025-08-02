#!/bin/bash

# Backup and Restore System for EchoTune AI Production
# Handles database backups, configuration backups, and data restoration

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/echotune/backups"
CONFIG_FILE="/opt/echotune/.env"
RETENTION_DAYS=30
COMPRESSION=true
REMOTE_BACKUP=${REMOTE_BACKUP:-false}
REMOTE_PATH=${REMOTE_BACKUP_PATH:-""}
AWS_S3_BUCKET=${AWS_S3_BUCKET:-""}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Create backup directory
setup_backup_dir() {
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
    
    # Set appropriate permissions
    chmod 750 "$BACKUP_DIR"
}

# Backup MongoDB
backup_mongodb() {
    local timestamp="$1"
    local backup_name="mongodb_${timestamp}"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    info "Starting MongoDB backup..."
    
    # Read MongoDB URI from config
    if [[ -f "$CONFIG_FILE" ]] && grep -q "MONGODB_URI" "$CONFIG_FILE"; then
        local mongo_uri=$(grep "MONGODB_URI" "$CONFIG_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        
        if [[ -n "$mongo_uri" && "$mongo_uri" != *"copilot:DapperMan77"* ]]; then
            if command -v mongodump &> /dev/null; then
                mkdir -p "$backup_path"
                
                if mongodump --uri="$mongo_uri" --out="$backup_path" --quiet; then
                    log "✓ MongoDB backup completed: $backup_name"
                    
                    if [[ "$COMPRESSION" == "true" ]]; then
                        info "Compressing MongoDB backup..."
                        tar -czf "${backup_path}.tar.gz" -C "$BACKUP_DIR" "$backup_name"
                        rm -rf "$backup_path"
                        log "✓ MongoDB backup compressed"
                    fi
                else
                    error "MongoDB backup failed"
                    return 1
                fi
            else
                warn "mongodump not available, skipping MongoDB backup"
            fi
        else
            warn "MongoDB URI not configured or using default, skipping backup"
        fi
    else
        warn "MongoDB configuration not found, skipping backup"
    fi
}

# Backup SQLite databases
backup_sqlite() {
    local timestamp="$1"
    local sqlite_files=(
        "/opt/echotune/data/users.db"
        "/opt/echotune/data/sessions.db"
        "/opt/echotune/data/analytics.db"
    )
    
    info "Starting SQLite backup..."
    
    for db_file in "${sqlite_files[@]}"; do
        if [[ -f "$db_file" ]]; then
            local db_name=$(basename "$db_file" .db)
            local backup_name="sqlite_${db_name}_${timestamp}"
            local backup_path="${BACKUP_DIR}/${backup_name}.db"
            
            if sqlite3 "$db_file" ".backup '$backup_path'"; then
                log "✓ SQLite backup completed: $db_name"
                
                if [[ "$COMPRESSION" == "true" ]]; then
                    gzip "$backup_path"
                    log "✓ SQLite backup compressed: ${backup_name}.db.gz"
                fi
            else
                error "SQLite backup failed for $db_name"
            fi
        fi
    done
}

# Backup configuration files
backup_config() {
    local timestamp="$1"
    local config_backup_dir="${BACKUP_DIR}/config_${timestamp}"
    
    info "Starting configuration backup..."
    
    mkdir -p "$config_backup_dir"
    
    # Configuration files to backup
    local config_files=(
        "/opt/echotune/.env"
        "/opt/echotune/docker-compose.yml"
        "/opt/echotune/nginx.conf"
        "/etc/nginx/nginx.conf"
        "/etc/systemd/system/echotune.service"
        "/etc/letsencrypt/live/primosphere.studio/"
    )
    
    for config_path in "${config_files[@]}"; do
        if [[ -e "$config_path" ]]; then
            local dest_dir="$config_backup_dir$(dirname "$config_path")"
            mkdir -p "$dest_dir"
            cp -r "$config_path" "$dest_dir/" 2>/dev/null || true
            log "✓ Backed up: $config_path"
        fi
    done
    
    # Backup important scripts
    if [[ -d "/opt/echotune/scripts" ]]; then
        cp -r "/opt/echotune/scripts" "$config_backup_dir/"
        log "✓ Backed up scripts directory"
    fi
    
    if [[ "$COMPRESSION" == "true" ]]; then
        info "Compressing configuration backup..."
        tar -czf "${config_backup_dir}.tar.gz" -C "$BACKUP_DIR" "config_${timestamp}"
        rm -rf "$config_backup_dir"
        log "✓ Configuration backup compressed"
    fi
}

# Backup application logs
backup_logs() {
    local timestamp="$1"
    local log_backup_dir="${BACKUP_DIR}/logs_${timestamp}"
    
    info "Starting logs backup..."
    
    mkdir -p "$log_backup_dir"
    
    # Log directories to backup
    local log_dirs=(
        "/var/log/nginx/"
        "/var/log/echotune/"
        "/opt/echotune/logs/"
    )
    
    for log_dir in "${log_dirs[@]}"; do
        if [[ -d "$log_dir" ]]; then
            local dest_dir="$log_backup_dir$log_dir"
            mkdir -p "$dest_dir"
            
            # Only backup logs from last 7 days to save space
            find "$log_dir" -name "*.log" -mtime -7 -exec cp {} "$dest_dir/" \; 2>/dev/null || true
            log "✓ Backed up logs from: $log_dir"
        fi
    done
    
    if [[ "$COMPRESSION" == "true" ]]; then
        info "Compressing logs backup..."
        tar -czf "${log_backup_dir}.tar.gz" -C "$BACKUP_DIR" "logs_${timestamp}"
        rm -rf "$log_backup_dir"
        log "✓ Logs backup compressed"
    fi
}

# Upload to remote storage
upload_remote() {
    local backup_files=("$@")
    
    if [[ "$REMOTE_BACKUP" == "true" ]]; then
        info "Starting remote backup upload..."
        
        if [[ -n "$AWS_S3_BUCKET" ]]; then
            # AWS S3 upload
            if command -v aws &> /dev/null; then
                for backup_file in "${backup_files[@]}"; do
                    if aws s3 cp "$backup_file" "s3://${AWS_S3_BUCKET}/echotune-backups/"; then
                        log "✓ Uploaded to S3: $(basename "$backup_file")"
                    else
                        error "Failed to upload to S3: $(basename "$backup_file")"
                    fi
                done
            else
                warn "AWS CLI not available for S3 upload"
            fi
        elif [[ -n "$REMOTE_PATH" ]]; then
            # SCP/rsync upload
            if command -v rsync &> /dev/null; then
                for backup_file in "${backup_files[@]}"; do
                    if rsync -avz "$backup_file" "$REMOTE_PATH/"; then
                        log "✓ Uploaded via rsync: $(basename "$backup_file")"
                    else
                        error "Failed to upload via rsync: $(basename "$backup_file")"
                    fi
                done
            elif command -v scp &> /dev/null; then
                for backup_file in "${backup_files[@]}"; do
                    if scp "$backup_file" "$REMOTE_PATH/"; then
                        log "✓ Uploaded via SCP: $(basename "$backup_file")"
                    else
                        error "Failed to upload via SCP: $(basename "$backup_file")"
                    fi
                done
            else
                warn "Neither rsync nor scp available for remote upload"
            fi
        fi
    fi
}

# Clean old backups
cleanup_old_backups() {
    info "Cleaning up old backups (older than $RETENTION_DAYS days)..."
    
    if [[ -d "$BACKUP_DIR" ]]; then
        local deleted_count=0
        while IFS= read -r -d '' backup_file; do
            rm -rf "$backup_file"
            ((deleted_count++))
        done < <(find "$BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -print0 2>/dev/null)
        
        if [[ $deleted_count -gt 0 ]]; then
            log "✓ Cleaned up $deleted_count old backup files"
        else
            log "✓ No old backups to clean up"
        fi
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    info "Verifying backup integrity: $(basename "$backup_file")"
    
    if [[ "$backup_file" == *.tar.gz ]]; then
        if tar -tzf "$backup_file" &>/dev/null; then
            log "✓ Backup archive integrity verified"
            return 0
        else
            error "Backup archive is corrupted"
            return 1
        fi
    elif [[ "$backup_file" == *.gz ]]; then
        if gzip -t "$backup_file" &>/dev/null; then
            log "✓ Backup file integrity verified"
            return 0
        else
            error "Backup file is corrupted"
            return 1
        fi
    else
        # For uncompressed files, just check if they exist and are readable
        if [[ -r "$backup_file" ]]; then
            log "✓ Backup file is readable"
            return 0
        else
            error "Backup file is not readable"
            return 1
        fi
    fi
}

# Restore MongoDB
restore_mongodb() {
    local backup_file="$1"
    
    info "Starting MongoDB restore from: $(basename "$backup_file")"
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Read MongoDB URI from config
    if [[ -f "$CONFIG_FILE" ]] && grep -q "MONGODB_URI" "$CONFIG_FILE"; then
        local mongo_uri=$(grep "MONGODB_URI" "$CONFIG_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        
        if [[ -n "$mongo_uri" && "$mongo_uri" != *"copilot:DapperMan77"* ]]; then
            if command -v mongorestore &> /dev/null; then
                local temp_dir="/tmp/mongodb_restore_$$"
                mkdir -p "$temp_dir"
                
                # Extract if compressed
                if [[ "$backup_file" == *.tar.gz ]]; then
                    tar -xzf "$backup_file" -C "$temp_dir"
                else
                    cp -r "$backup_file"/* "$temp_dir/"
                fi
                
                # Confirm restore
                read -p "Are you sure you want to restore MongoDB? This will overwrite existing data (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    if mongorestore --uri="$mongo_uri" --drop "$temp_dir" --quiet; then
                        log "✓ MongoDB restore completed successfully"
                    else
                        error "MongoDB restore failed"
                        rm -rf "$temp_dir"
                        return 1
                    fi
                else
                    warn "MongoDB restore cancelled"
                fi
                
                rm -rf "$temp_dir"
            else
                error "mongorestore not available"
                return 1
            fi
        else
            error "MongoDB URI not configured properly"
            return 1
        fi
    else
        error "MongoDB configuration not found"
        return 1
    fi
}

# List available backups
list_backups() {
    info "Available backups in $BACKUP_DIR:"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        local backup_count=0
        for backup_file in "$BACKUP_DIR"/*; do
            if [[ -f "$backup_file" ]]; then
                local file_size=$(du -h "$backup_file" | cut -f1)
                local file_date=$(date -r "$backup_file" "+%Y-%m-%d %H:%M:%S")
                echo "  $(basename "$backup_file") - $file_size - $file_date"
                ((backup_count++))
            fi
        done
        
        if [[ $backup_count -eq 0 ]]; then
            warn "No backups found"
        else
            log "Found $backup_count backup files"
        fi
    else
        warn "Backup directory does not exist: $BACKUP_DIR"
    fi
}

# Full backup operation
full_backup() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_files=()
    
    log "Starting full backup with timestamp: $timestamp"
    
    setup_backup_dir
    
    # Perform all backups
    backup_mongodb "$timestamp"
    backup_sqlite "$timestamp"
    backup_config "$timestamp"
    backup_logs "$timestamp"
    
    # Collect backup files
    for backup_file in "$BACKUP_DIR"/*"$timestamp"*; do
        if [[ -f "$backup_file" ]]; then
            if verify_backup "$backup_file"; then
                backup_files+=("$backup_file")
            fi
        fi
    done
    
    # Upload to remote storage
    if [[ ${#backup_files[@]} -gt 0 ]]; then
        upload_remote "${backup_files[@]}"
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    log "Full backup completed successfully"
    log "Created ${#backup_files[@]} backup files"
}

# Test backup and restore
test_backup_restore() {
    local test_timestamp="test_$(date '+%Y%m%d_%H%M%S')"
    
    info "Starting backup and restore test..."
    
    # Create a test backup
    backup_config "$test_timestamp"
    
    local test_backup="${BACKUP_DIR}/config_${test_timestamp}.tar.gz"
    
    if [[ -f "$test_backup" ]]; then
        if verify_backup "$test_backup"; then
            log "✓ Test backup created and verified successfully"
            
            # Clean up test backup
            rm -f "$test_backup"
            log "✓ Test backup cleaned up"
            
            log "✓ Backup and restore test completed successfully"
        else
            error "Test backup verification failed"
            return 1
        fi
    else
        error "Test backup creation failed"
        return 1
    fi
}

# Main function
main() {
    case "${1:-}" in
        "backup"|"full")
            full_backup
            ;;
        "restore")
            if [[ -n "${2:-}" ]]; then
                restore_mongodb "$2"
            else
                error "Please specify backup file to restore"
                echo "Usage: $0 restore <backup_file>"
                list_backups
                exit 1
            fi
            ;;
        "list")
            list_backups
            ;;
        "test")
            test_backup_restore
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "verify")
            if [[ -n "${2:-}" ]]; then
                verify_backup "$2"
            else
                error "Please specify backup file to verify"
                echo "Usage: $0 verify <backup_file>"
                exit 1
            fi
            ;;
        "help"|"-h"|"--help")
            echo "EchoTune AI Backup and Restore System"
            echo "Usage: $0 <command> [options]"
            echo
            echo "Commands:"
            echo "  backup, full     Create full backup of all data"
            echo "  restore <file>   Restore from specified backup file"
            echo "  list             List available backups"
            echo "  test             Test backup and restore functionality"
            echo "  cleanup          Remove old backups based on retention policy"
            echo "  verify <file>    Verify backup file integrity"
            echo "  help             Show this help message"
            echo
            echo "Environment Variables:"
            echo "  RETENTION_DAYS      Days to keep backups (default: 30)"
            echo "  REMOTE_BACKUP       Enable remote backup (true/false)"
            echo "  REMOTE_BACKUP_PATH  Remote path for SCP/rsync backup"
            echo "  AWS_S3_BUCKET       S3 bucket for remote backup"
            ;;
        *)
            error "Unknown command: ${1:-}"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi