#!/bin/bash

# 📚 EchoTune AI - Documentation Analyzer and Cleanup Tool
# Analyzes documentation for outdated content, redundancy, and consolidation opportunities
# Provides recommendations and automated cleanup options

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANALYSIS_LOG="$PROJECT_ROOT/docs-analysis-$(date +%Y%m%d_%H%M%S).log"
BACKUP_DIR="$PROJECT_ROOT/.docs-backup-$(date +%Y%m%d_%H%M%S)"

# Options
DRY_RUN=false
AUTO_CLEANUP=false
INTERACTIVE_MODE=false
CREATE_INDEX=false

# Analysis results
declare -A DOC_ANALYSIS
declare -A REDUNDANCY_MAP
declare -a OUTDATED_DOCS
declare -a ESSENTIAL_DOCS
declare -a CLEANUP_CANDIDATES

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$ANALYSIS_LOG"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$ANALYSIS_LOG"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$ANALYSIS_LOG"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$ANALYSIS_LOG"; }
log_analysis() { echo -e "${PURPLE}[ANALYSIS]${NC} $1" | tee -a "$ANALYSIS_LOG"; }

print_header() {
    clear
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                  📚 DOCUMENTATION ANALYZER & CLEANUP TOOL                 ║${NC}"
    echo -e "${CYAN}║                        EchoTune AI Project Maintenance                     ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Scan for all documentation files
scan_documentation() {
    log_info "Scanning for documentation files..."
    
    cd "$PROJECT_ROOT"
    
    # Find all markdown files
    local md_files=($(find . -maxdepth 1 -name "*.md" -type f | sort))
    local docs_files=($(find docs/ -name "*.md" -type f 2>/dev/null | sort))
    
    log_info "Found ${#md_files[@]} root-level markdown files"
    log_info "Found ${#docs_files[@]} files in docs/ directory"
    
    # Analyze each file
    for file in "${md_files[@]}" "${docs_files[@]}"; do
        analyze_document "$file"
    done
    
    log_success "Documentation scan complete"
}

# Analyze individual document
analyze_document() {
    local file="$1"
    local filename=$(basename "$file")
    
    if [ ! -f "$file" ]; then
        return 1
    fi
    
    # Get file statistics
    local word_count=$(wc -w < "$file" 2>/dev/null || echo "0")
    local line_count=$(wc -l < "$file" 2>/dev/null || echo "0")
    local size=$(du -h "$file" 2>/dev/null | cut -f1 || echo "0")
    local last_modified=$(stat -c %Y "$file" 2>/dev/null || date +%s)
    local age_days=$(( ($(date +%s) - last_modified) / 86400 ))
    
    # Content analysis
    local has_outdated_info=false
    local has_deployment_info=false
    local has_installation_info=false
    local is_comprehensive=false
    local is_duplicate=false
    
    # Check for outdated patterns
    if grep -qi -E "(version|v[0-9]|deprecated|old|legacy|todo|fixme|temporary)" "$file"; then
        has_outdated_info=true
    fi
    
    # Check content type
    if grep -qi -E "(deploy|installation|setup|config|environment)" "$file"; then
        if grep -qi "deploy" "$file"; then
            has_deployment_info=true
        fi
        if grep -qi -E "(install|setup)" "$file"; then
            has_installation_info=true
        fi
    fi
    
    # Check if comprehensive (large, detailed docs)
    if [ "$word_count" -gt 1000 ] && [ "$line_count" -gt 50 ]; then
        is_comprehensive=true
    fi
    
    # Store analysis
    DOC_ANALYSIS["$file"]="words:$word_count,lines:$line_count,size:$size,age:$age_days,outdated:$has_outdated_info,deployment:$has_deployment_info,installation:$has_installation_info,comprehensive:$is_comprehensive"
    
    # Categorize documents
    categorize_document "$file" "$filename" "$word_count" "$age_days" "$has_outdated_info"
}

# Categorize documents for cleanup decisions
categorize_document() {
    local file="$1"
    local filename="$2"
    local word_count="$3"
    local age_days="$4"
    local has_outdated_info="$5"
    
    # Essential documents that should never be removed
    case "$filename" in
        "README.md"|"CONTRIBUTING.md"|"LICENSE.md"|"CHANGELOG.md"|"SECURITY.md")
            ESSENTIAL_DOCS+=("$file")
            return
            ;;
    esac
    
    # Outdated documents (older than 180 days with little content or outdated markers)
    if [ "$age_days" -gt 180 ] && ([ "$word_count" -lt 100 ] || [ "$has_outdated_info" = true ]); then
        OUTDATED_DOCS+=("$file")
        CLEANUP_CANDIDATES+=("$file")
        return
    fi
    
    # Check for redundancy patterns
    check_document_redundancy "$file" "$filename"
}

# Check for duplicate or redundant content
check_document_redundancy() {
    local file="$1"
    local filename="$2"
    
    # Define redundancy patterns
    declare -A SIMILAR_PATTERNS=(
        ["DEPLOYMENT"]="DEPLOYMENT|DEPLOY|PRODUCTION|INSTALL"
        ["GUIDE"]="GUIDE|TUTORIAL|WALKTHROUGH|HOWTO"
        ["SUMMARY"]="SUMMARY|REPORT|STATUS|COMPLETION"
        ["TODO"]="TODO|PLAN|IMPLEMENTATION|PHASE"
        ["INTEGRATION"]="INTEGRATION|MCP|SERVER"
    )
    
    for pattern_name in "${!SIMILAR_PATTERNS[@]}"; do
        local pattern="${SIMILAR_PATTERNS[$pattern_name]}"
        
        if echo "$filename" | grep -qi -E "$pattern"; then
            if [ -z "${REDUNDANCY_MAP[$pattern_name]}" ]; then
                REDUNDANCY_MAP[$pattern_name]="$file"
            else
                REDUNDANCY_MAP[$pattern_name]="${REDUNDANCY_MAP[$pattern_name]},$file"
                CLEANUP_CANDIDATES+=("$file")
            fi
        fi
    done
}

# Analyze redundancy and suggest consolidation
analyze_redundancy() {
    log_analysis "Analyzing document redundancy..."
    
    echo ""
    echo -e "${WHITE}📋 Redundancy Analysis:${NC}"
    echo ""
    
    for pattern_name in "${!REDUNDANCY_MAP[@]}"; do
        local files="${REDUNDANCY_MAP[$pattern_name]}"
        local file_array=(${files//,/ })
        
        if [ ${#file_array[@]} -gt 1 ]; then
            echo -e "${YELLOW}$pattern_name Documentation (${#file_array[@]} files):${NC}"
            
            local primary_candidate=""
            local max_words=0
            
            for file in "${file_array[@]}"; do
                local analysis="${DOC_ANALYSIS[$file]}"
                local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2)
                local age=$(echo "$analysis" | grep -o "age:[0-9]*" | cut -d: -f2)
                local comprehensive=$(echo "$analysis" | grep -o "comprehensive:[^,]*" | cut -d: -f2)
                
                printf "  • %-40s (%s words, %s days old, comprehensive: %s)\n" \
                    "$(basename "$file")" "$words" "$age" "$comprehensive"
                
                # Identify primary candidate (most comprehensive and recent)
                if [ "$words" -gt "$max_words" ] && [ "$age" -lt 90 ]; then
                    primary_candidate="$file"
                    max_words="$words"
                fi
            done
            
            if [ -n "$primary_candidate" ]; then
                echo -e "    ${GREEN}→ Suggested primary: $(basename "$primary_candidate")${NC}"
            else
                echo -e "    ${YELLOW}→ Manual review recommended${NC}"
            fi
            echo ""
        fi
    done
}

# Identify truly outdated documents
identify_outdated() {
    log_analysis "Identifying outdated documentation..."
    
    echo ""
    echo -e "${WHITE}📅 Outdated Document Analysis:${NC}"
    echo ""
    
    if [ ${#OUTDATED_DOCS[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ No obviously outdated documents found${NC}"
        return
    fi
    
    for file in "${OUTDATED_DOCS[@]}"; do
        local analysis="${DOC_ANALYSIS[$file]}"
        local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2)
        local age=$(echo "$analysis" | grep -o "age:[0-9]*" | cut -d: -f2)
        local outdated=$(echo "$analysis" | grep -o "outdated:[^,]*" | cut -d: -f2)
        
        printf "• %-40s (%s words, %s days old, outdated markers: %s)\n" \
            "$(basename "$file")" "$words" "$age" "$outdated"
    done
    
    echo ""
    echo -e "${YELLOW}These documents may be candidates for removal or major updates.${NC}"
    echo ""
}

# Generate documentation index
generate_documentation_index() {
    log_info "Generating documentation index..."
    
    local index_file="$PROJECT_ROOT/DOCUMENTATION_INDEX.md"
    
    cat > "$index_file" << 'EOF'
# 📚 EchoTune AI - Documentation Index

*Generated automatically by documentation analyzer*

## 🎯 Essential Documentation

### Core Project Information
EOF
    
    # Add essential docs
    for file in "${ESSENTIAL_DOCS[@]}"; do
        if [ -f "$file" ]; then
            local title=$(head -n 10 "$file" | grep "^# " | head -n 1 | sed 's/^# //' || basename "$file" .md)
            local analysis="${DOC_ANALYSIS[$file]}"
            local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2 || echo "0")
            
            echo "- **[$title](./$file)** - $words words" >> "$index_file"
        fi
    done
    
    cat >> "$index_file" << 'EOF'

## 🚀 Deployment & Installation

### Quick Start
- Use the **Interactive Installation Wizard**: `./scripts/interactive-installation-wizard.sh`
- Or run **One-Click Deploy**: `./deploy-one-click.sh`

### Advanced Deployment
EOF
    
    # Add deployment docs
    for file in $(find . -maxdepth 1 -name "*DEPLOY*" -o -name "*INSTALL*" -o -name "*PRODUCTION*" | head -5); do
        if [ -f "$file" ]; then
            local title=$(head -n 10 "$file" | grep "^# " | head -n 1 | sed 's/^# //' || basename "$file" .md)
            local analysis="${DOC_ANALYSIS[$file]:-}"
            local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2 || echo "0")
            
            echo "- **[$title](./$file)** - $words words" >> "$index_file"
        fi
    done
    
    cat >> "$index_file" << 'EOF'

## 🔧 Configuration & Setup

### Environment Configuration
- **Environment Validator**: `./scripts/environment-validator.sh --interactive`
- **Comprehensive Deployment Validator**: `./scripts/comprehensive-deployment-validator.sh`

### Integration Guides
EOF
    
    # Add integration docs
    for file in $(find . docs/ -name "*INTEGRATION*" -o -name "*MCP*" -o -name "*API*" 2>/dev/null | head -5); do
        if [ -f "$file" ]; then
            local title=$(head -n 10 "$file" | grep "^# " | head -n 1 | sed 's/^# //' || basename "$file" .md)
            local analysis="${DOC_ANALYSIS[$file]:-}"
            local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2 || echo "0")
            
            echo "- **[$title](./$file)** - $words words" >> "$index_file"
        fi
    done
    
    cat >> "$index_file" << 'EOF'

## 🏗️ Architecture & Development

### System Architecture
EOF
    
    # Add architecture docs
    for file in $(find . docs/ -name "*ARCHITECTURE*" -o -name "*DATABASE*" -o -name "*SECURITY*" 2>/dev/null | head -5); do
        if [ -f "$file" ]; then
            local title=$(head -n 10 "$file" | grep "^# " | head -n 1 | sed 's/^# //' || basename "$file" .md)
            local analysis="${DOC_ANALYSIS[$file]:-}"
            local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2 || echo "0")
            
            echo "- **[$title](./$file)** - $words words" >> "$index_file"
        fi
    done
    
    cat >> "$index_file" << 'EOF'

## 🐛 Troubleshooting & Support

### Issue Resolution
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[GitHub Issues](https://github.com/primoscope/doved/issues)** - Report bugs and get help

### Validation Tools
- **Deployment Validator**: `./scripts/comprehensive-deployment-validator.sh --all`
- **Environment Validator**: `./scripts/environment-validator.sh --fix`
- **Documentation Analyzer**: `./scripts/documentation-analyzer.sh`

## 📈 Project Status & Reports

### Recent Updates
EOF
    
    # Add recent status docs
    for file in $(find . -name "*SUMMARY*" -o -name "*REPORT*" -o -name "*STATUS*" | head -3); do
        if [ -f "$file" ]; then
            local title=$(head -n 10 "$file" | grep "^# " | head -n 1 | sed 's/^# //' || basename "$file" .md)
            local analysis="${DOC_ANALYSIS[$file]:-}"
            local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2 || echo "0")
            
            echo "- **[$title](./$file)** - $words words" >> "$index_file"
        fi
    done
    
    cat >> "$index_file" << 'EOF'

---

## 🧹 Documentation Maintenance

This index is automatically generated and updated. For comprehensive documentation analysis and cleanup:

```bash
# Analyze all documentation
./scripts/documentation-analyzer.sh

# Interactive cleanup mode  
./scripts/documentation-analyzer.sh --interactive

# Auto-cleanup outdated docs (with backup)
./scripts/documentation-analyzer.sh --cleanup
```

**Last Updated**: Generated automatically on each analysis run
EOF
    
    log_success "Documentation index created: $index_file"
}

# Create backup of documentation
create_backup() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would create backup in: $BACKUP_DIR"
        return
    fi
    
    log_info "Creating documentation backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Copy all markdown files
    find "$PROJECT_ROOT" -name "*.md" -type f -exec cp {} "$BACKUP_DIR/" \; 2>/dev/null || true
    
    log_success "Backup created in: $BACKUP_DIR"
}

# Perform automated cleanup
perform_cleanup() {
    if [ ${#CLEANUP_CANDIDATES[@]} -eq 0 ]; then
        log_info "No cleanup candidates identified"
        return
    fi
    
    log_info "Performing automated cleanup..."
    
    create_backup
    
    local cleaned_count=0
    
    for file in "${CLEANUP_CANDIDATES[@]}"; do
        if [ -f "$file" ]; then
            if [ "$DRY_RUN" = true ]; then
                log_info "[DRY RUN] Would remove: $file"
            else
                if [ "$AUTO_CLEANUP" = true ] || confirm_removal "$file"; then
                    rm "$file"
                    log_success "Removed: $file"
                    cleaned_count=$((cleaned_count + 1))
                fi
            fi
        fi
    done
    
    if [ "$cleaned_count" -gt 0 ]; then
        log_success "Cleanup complete. Removed $cleaned_count file(s)"
        log_info "Backup available in: $BACKUP_DIR"
    fi
}

# Interactive confirmation for file removal
confirm_removal() {
    local file="$1"
    local filename=$(basename "$file")
    
    echo ""
    echo -e "${YELLOW}📄 Review file: $filename${NC}"
    
    # Show file preview
    echo -e "${CYAN}Content preview:${NC}"
    head -n 5 "$file" | sed 's/^/  | /'
    echo "  | ..."
    echo ""
    
    local analysis="${DOC_ANALYSIS[$file]}"
    local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2)
    local age=$(echo "$analysis" | grep -o "age:[0-9]*" | cut -d: -f2)
    
    echo -e "${CYAN}File info:${NC} $words words, $age days old"
    echo ""
    
    read -p "Remove this file? (y/N): " -n 1 -r
    echo ""
    
    [[ $REPLY =~ ^[Yy]$ ]]
}

# Interactive mode
interactive_mode() {
    print_header
    
    echo -e "${CYAN}📚 Welcome to the Interactive Documentation Analyzer!${NC}"
    echo ""
    echo "This tool will help you:"
    echo "• Identify outdated documentation"
    echo "• Find redundant or duplicate content"
    echo "• Consolidate related documents"
    echo "• Generate a comprehensive documentation index"
    echo ""
    
    read -p "Press Enter to start analysis..." -r
    
    # Run full analysis
    scan_documentation
    analyze_redundancy
    identify_outdated
    
    # Interactive menu
    while true; do
        echo ""
        echo -e "${WHITE}📋 What would you like to do?${NC}"
        echo ""
        echo "1) Generate documentation index"
        echo "2) Review cleanup candidates interactively"
        echo "3) Auto-cleanup with confirmation"
        echo "4) Create backup only"
        echo "5) Show detailed analysis"
        echo "6) Exit"
        echo ""
        
        read -p "Select option (1-6): " -n 1 -r
        echo ""
        
        case $REPLY in
            1)
                CREATE_INDEX=true
                generate_documentation_index
                ;;
            2)
                perform_cleanup
                ;;
            3)
                AUTO_CLEANUP=false
                perform_cleanup
                ;;
            4)
                create_backup
                ;;
            5)
                show_detailed_analysis
                ;;
            6)
                log_info "Documentation analysis complete"
                break
                ;;
            *)
                echo -e "${RED}Invalid option. Please choose 1-6.${NC}"
                ;;
        esac
    done
}

# Show detailed analysis
show_detailed_analysis() {
    echo ""
    echo -e "${WHITE}📊 Detailed Documentation Analysis:${NC}"
    echo ""
    
    local total_docs=0
    local total_words=0
    local total_size=0
    
    for file in "${!DOC_ANALYSIS[@]}"; do
        local analysis="${DOC_ANALYSIS[$file]}"
        local words=$(echo "$analysis" | grep -o "words:[0-9]*" | cut -d: -f2)
        local size_raw=$(echo "$analysis" | grep -o "size:[^,]*" | cut -d: -f2)
        local age=$(echo "$analysis" | grep -o "age:[0-9]*" | cut -d: -f2)
        local comprehensive=$(echo "$analysis" | grep -o "comprehensive:[^,]*" | cut -d: -f2)
        
        total_docs=$((total_docs + 1))
        total_words=$((total_words + words))
        
        printf "%-50s %8s words %6s days %s\n" \
            "$(basename "$file")" "$words" "$age" \
            "$([ "$comprehensive" = "true" ] && echo "[COMPREHENSIVE]" || echo "")"
    done
    
    echo ""
    echo -e "${CYAN}Summary Statistics:${NC}"
    echo "  Total Documents: $total_docs"
    echo "  Total Words: $total_words"
    echo "  Essential Docs: ${#ESSENTIAL_DOCS[@]}"
    echo "  Cleanup Candidates: ${#CLEANUP_CANDIDATES[@]}"
    echo "  Outdated Docs: ${#OUTDATED_DOCS[@]}"
    echo ""
}

# Generate summary report
generate_summary() {
    echo ""
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                           DOCUMENTATION ANALYSIS SUMMARY                    ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${WHITE}📊 Analysis Results:${NC}"
    echo "   Total Documents Analyzed: ${#DOC_ANALYSIS[@]}"
    echo "   Essential Documents: ${#ESSENTIAL_DOCS[@]}"
    echo "   Outdated Documents: ${#OUTDATED_DOCS[@]}"
    echo "   Cleanup Candidates: ${#CLEANUP_CANDIDATES[@]}"
    echo ""
    
    if [ ${#CLEANUP_CANDIDATES[@]} -gt 0 ]; then
        echo -e "${YELLOW}🧹 Cleanup Recommendations:${NC}"
        for file in "${CLEANUP_CANDIDATES[@]}"; do
            echo "   • $(basename "$file")"
        done
        echo ""
    fi
    
    echo -e "${CYAN}🔧 Recommended Actions:${NC}"
    if [ ${#CLEANUP_CANDIDATES[@]} -gt 0 ]; then
        echo "   1. Review cleanup candidates: --interactive"
        echo "   2. Create backup before cleanup: --cleanup"
    fi
    echo "   3. Generate documentation index: --index"
    echo "   4. Update README with current information"
    echo "   5. Consolidate redundant deployment guides"
    echo ""
    
    echo -e "${GREEN}✨ Tools Available:${NC}"
    echo "   • Interactive mode: ./scripts/documentation-analyzer.sh --interactive"
    echo "   • Auto cleanup: ./scripts/documentation-analyzer.sh --cleanup --auto"
    echo "   • Generate index: ./scripts/documentation-analyzer.sh --index"
    echo ""
    
    log_info "Analysis complete. Results logged to: $ANALYSIS_LOG"
}

show_help() {
    cat << EOF
EchoTune AI - Documentation Analyzer and Cleanup Tool

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --interactive           Interactive mode for guided cleanup
    --cleanup               Perform automated cleanup (creates backup)
    --auto                  Auto-cleanup without confirmation
    --dry-run               Show what would be done without making changes
    --index                 Generate documentation index
    --help                  Show this help message

EXAMPLES:
    $0                      # Analyze documentation only
    $0 --interactive        # Interactive mode with guided cleanup
    $0 --cleanup            # Automated cleanup with confirmation
    $0 --cleanup --auto     # Automated cleanup without confirmation
    $0 --index             # Generate documentation index only

FEATURES:
    • Identifies outdated and redundant documentation
    • Detects duplicate content patterns
    • Suggests consolidation opportunities
    • Creates comprehensive documentation index
    • Automated cleanup with backup protection
    • Interactive review and confirmation

EXIT CODES:
    0    Analysis completed successfully
    1    Issues found or cleanup needed
    2    Critical errors occurred

For more information, visit: https://github.com/primoscope/doved
EOF
}

main() {
    # Initialize log
    echo "EchoTune AI Documentation Analysis - $(date)" > "$ANALYSIS_LOG"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --interactive)
                INTERACTIVE_MODE=true
                shift
                ;;
            --cleanup)
                AUTO_CLEANUP=true
                shift
                ;;
            --auto)
                AUTO_CLEANUP=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --index)
                CREATE_INDEX=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    cd "$PROJECT_ROOT"
    
    if [ "$INTERACTIVE_MODE" = true ]; then
        interactive_mode
        exit 0
    fi
    
    print_header
    
    # Run analysis
    scan_documentation
    analyze_redundancy
    identify_outdated
    
    # Perform requested actions
    if [ "$CREATE_INDEX" = true ]; then
        generate_documentation_index
    fi
    
    if [ "$AUTO_CLEANUP" = true ]; then
        perform_cleanup
    fi
    
    # Show summary
    generate_summary
    
    # Exit with appropriate code
    if [ ${#CLEANUP_CANDIDATES[@]} -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

main "$@"