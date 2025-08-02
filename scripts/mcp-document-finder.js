#!/usr/bin/env node

/**
 * MCP Document and Template Finder
 * Uses MCP server capabilities to discover and validate documentation and template files
 * for the EchoTune AI deployment process
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class MCPDocumentFinder {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.mcpServerPath = options.mcpServerPath || path.join(this.projectRoot, 'mcp-server');
        this.verbose = options.verbose || false;
        this.foundDocuments = new Map();
        this.foundTemplates = new Map();
        this.validationResults = new Map();
    }

    log(message, level = 'info') {
        if (this.verbose || level === 'error') {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
        }
    }

    async findDocumentationFiles() {
        this.log('Starting documentation file discovery...');
        
        const docPatterns = [
            'README.md',
            'ONE-CLICK-DEPLOY.md',
            'PRODUCTION_DEPLOYMENT_GUIDE.md',
            'DIGITALOCEAN_DEPLOYMENT.md',
            'DEPLOYMENT_*.md',
            'TROUBLESHOOTING.md',
            'docs/**/*.md'
        ];

        const foundDocs = [];

        for (const pattern of docPatterns) {
            try {
                const files = await this.searchForFiles(pattern);
                foundDocs.push(...files);
            } catch (error) {
                this.log(`Error searching for pattern ${pattern}: ${error.message}`, 'error');
            }
        }

        // Remove duplicates and validate
        const uniqueDocs = [...new Set(foundDocs)];
        
        for (const docPath of uniqueDocs) {
            try {
                await this.validateDocumentationFile(docPath);
                this.foundDocuments.set(path.basename(docPath), {
                    path: docPath,
                    type: this.getDocumentType(docPath),
                    size: (await fs.stat(docPath)).size,
                    lastModified: (await fs.stat(docPath)).mtime
                });
            } catch (error) {
                this.log(`Failed to validate documentation file ${docPath}: ${error.message}`, 'error');
            }
        }

        this.log(`Found ${this.foundDocuments.size} documentation files`);
        return this.foundDocuments;
    }

    async findTemplateFiles() {
        this.log('Starting template file discovery...');
        
        const templatePatterns = [
            '.env.example',
            '.env.production.example',
            'deploy-one-click.sh',
            'docker-compose.yml',
            'docker-compose.prod.yml',
            'nginx.conf',
            'Dockerfile',
            'package.json',
            'systemd/**/*.service',
            'scripts/**/*.sh'
        ];

        const foundTemplates = [];

        for (const pattern of templatePatterns) {
            try {
                const files = await this.searchForFiles(pattern);
                foundTemplates.push(...files);
            } catch (error) {
                this.log(`Error searching for pattern ${pattern}: ${error.message}`, 'error');
            }
        }

        // Remove duplicates and validate
        const uniqueTemplates = [...new Set(foundTemplates)];
        
        for (const templatePath of uniqueTemplates) {
            try {
                await this.validateTemplateFile(templatePath);
                this.foundTemplates.set(path.basename(templatePath), {
                    path: templatePath,
                    type: this.getTemplateType(templatePath),
                    size: (await fs.stat(templatePath)).size,
                    lastModified: (await fs.stat(templatePath)).mtime
                });
            } catch (error) {
                this.log(`Failed to validate template file ${templatePath}: ${error.message}`, 'error');
            }
        }

        this.log(`Found ${this.foundTemplates.size} template files`);
        return this.foundTemplates;
    }

    async searchForFiles(pattern) {
        const isGlob = pattern.includes('*') || pattern.includes('**');
        
        if (isGlob) {
            return await this.globSearch(pattern);
        } else {
            const filePath = path.join(this.projectRoot, pattern);
            try {
                await fs.access(filePath);
                return [filePath];
            } catch {
                return [];
            }
        }
    }

    async globSearch(pattern) {
        // Simple glob implementation for common patterns
        const results = [];
        
        if (pattern.includes('**')) {
            // Recursive search
            const basePattern = pattern.replace('**/', '').replace('**', '');
            const found = await this.recursiveSearch(this.projectRoot, basePattern);
            results.push(...found);
        } else if (pattern.includes('*')) {
            // Single level wildcard
            const dir = path.dirname(pattern);
            const filePattern = path.basename(pattern);
            const searchDir = path.join(this.projectRoot, dir === '.' ? '' : dir);
            
            try {
                const files = await fs.readdir(searchDir);
                for (const file of files) {
                    if (this.matchesPattern(file, filePattern)) {
                        results.push(path.join(searchDir, file));
                    }
                }
            } catch (error) {
                // Directory doesn't exist, ignore
            }
        }
        
        return results;
    }

    async recursiveSearch(dir, pattern) {
        const results = [];
        
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip common directories that shouldn't contain our files
                    if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
                        const subResults = await this.recursiveSearch(fullPath, pattern);
                        results.push(...subResults);
                    }
                } else if (entry.isFile()) {
                    if (this.matchesPattern(entry.name, pattern)) {
                        results.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Can't read directory, ignore
        }
        
        return results;
    }

    matchesPattern(filename, pattern) {
        // Convert simple glob pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(filename);
    }

    async validateDocumentationFile(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        const validation = {
            path: filePath,
            valid: true,
            issues: [],
            metadata: {}
        };

        // Check for common documentation issues
        if (content.length < 100) {
            validation.issues.push('Document appears to be too short');
        }

        if (path.basename(filePath) === 'README.md' && !content.includes('# ')) {
            validation.issues.push('README missing main heading');
        }

        if (filePath.includes('DEPLOY') && !content.includes('```')) {
            validation.issues.push('Deployment documentation missing code examples');
        }

        // Extract metadata
        validation.metadata = {
            lineCount: content.split('\n').length,
            hasCodeBlocks: content.includes('```'),
            hasLinks: content.includes('[') && content.includes(']('),
            hasHeadings: content.includes('# '),
            language: this.detectLanguage(content)
        };

        validation.valid = validation.issues.length === 0;
        this.validationResults.set(filePath, validation);
        
        return validation;
    }

    async validateTemplateFile(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        const validation = {
            path: filePath,
            valid: true,
            issues: [],
            metadata: {}
        };

        const ext = path.extname(filePath);
        const basename = path.basename(filePath);

        // Validate based on file type
        if (basename.startsWith('.env')) {
            await this.validateEnvFile(content, validation);
        } else if (ext === '.yml' || ext === '.yaml') {
            await this.validateYamlFile(content, validation);
        } else if (ext === '.json') {
            await this.validateJsonFile(content, validation);
        } else if (ext === '.sh') {
            await this.validateShellScript(content, validation);
        } else if (basename === 'Dockerfile') {
            await this.validateDockerfile(content, validation);
        } else if (basename === 'nginx.conf') {
            await this.validateNginxConfig(content, validation);
        }

        validation.valid = validation.issues.length === 0;
        this.validationResults.set(filePath, validation);
        
        return validation;
    }

    async validateEnvFile(content, validation) {
        const lines = content.split('\n');
        let varCount = 0;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                if (trimmed.includes('=')) {
                    varCount++;
                    // Check for common security issues
                    if (trimmed.includes('password') && !trimmed.includes('your_')) {
                        validation.issues.push(`Possible hardcoded password in line: ${trimmed.substring(0, 50)}`);
                    }
                } else {
                    validation.issues.push(`Invalid environment variable format: ${trimmed}`);
                }
            }
        }
        
        validation.metadata.variableCount = varCount;
        
        if (varCount === 0) {
            validation.issues.push('No environment variables found');
        }
    }

    async validateYamlFile(content, validation) {
        try {
            // Basic YAML validation - check for common syntax issues
            const lines = content.split('\n');
            let indentLevel = 0;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() && !line.trim().startsWith('#')) {
                    const currentIndent = line.length - line.trimLeft().length;
                    if (currentIndent % 2 !== 0) {
                        validation.issues.push(`Inconsistent indentation at line ${i + 1}`);
                    }
                }
            }
        } catch (error) {
            validation.issues.push(`YAML syntax error: ${error.message}`);
        }
    }

    async validateJsonFile(content, validation) {
        try {
            JSON.parse(content);
            validation.metadata.isValidJson = true;
        } catch (error) {
            validation.issues.push(`JSON syntax error: ${error.message}`);
            validation.metadata.isValidJson = false;
        }
    }

    async validateShellScript(content, validation) {
        if (!content.startsWith('#!/')) {
            validation.issues.push('Shell script missing shebang');
        }
        
        if (!content.includes('set -e')) {
            validation.issues.push('Shell script should use "set -e" for error handling');
        }
        
        validation.metadata.isExecutable = true; // We'll check this elsewhere
    }

    async validateDockerfile(content, validation) {
        if (!content.includes('FROM ')) {
            validation.issues.push('Dockerfile missing FROM instruction');
        }
        
        if (content.includes('ADD ') && !content.includes('COPY ')) {
            validation.issues.push('Dockerfile uses ADD instead of COPY');
        }
    }

    async validateNginxConfig(content, validation) {
        if (!content.includes('server {')) {
            validation.issues.push('Nginx config missing server block');
        }
        
        if (!content.includes('location ')) {
            validation.issues.push('Nginx config missing location directives');
        }
    }

    detectLanguage(content) {
        if (content.includes('```bash') || content.includes('```sh')) return 'bash';
        if (content.includes('```javascript') || content.includes('```js')) return 'javascript';
        if (content.includes('```python') || content.includes('```py')) return 'python';
        if (content.includes('```yaml') || content.includes('```yml')) return 'yaml';
        if (content.includes('```json')) return 'json';
        return 'markdown';
    }

    getDocumentType(filePath) {
        const basename = path.basename(filePath).toLowerCase();
        
        if (basename.includes('readme')) return 'readme';
        if (basename.includes('deploy')) return 'deployment';
        if (basename.includes('troubleshoot')) return 'troubleshooting';
        if (basename.includes('guide')) return 'guide';
        if (basename.includes('doc')) return 'documentation';
        
        return 'other';
    }

    getTemplateType(filePath) {
        const basename = path.basename(filePath).toLowerCase();
        const ext = path.extname(filePath).toLowerCase();
        
        if (basename.startsWith('.env')) return 'environment';
        if (basename.includes('deploy') && ext === '.sh') return 'deployment';
        if (ext === '.yml' || ext === '.yaml') return 'yaml';
        if (ext === '.json') return 'json';
        if (ext === '.sh') return 'script';
        if (basename === 'dockerfile') return 'docker';
        if (basename.includes('nginx')) return 'nginx';
        if (ext === '.service') return 'systemd';
        
        return 'other';
    }

    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                documentationFiles: this.foundDocuments.size,
                templateFiles: this.foundTemplates.size,
                validationIssues: Array.from(this.validationResults.values())
                    .reduce((sum, result) => sum + result.issues.length, 0)
            },
            documentation: Object.fromEntries(this.foundDocuments),
            templates: Object.fromEntries(this.foundTemplates),
            validations: Object.fromEntries(this.validationResults)
        };

        return report;
    }

    async exportReport(outputPath) {
        const report = await this.generateReport();
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
        this.log(`Report exported to ${outputPath}`);
        return report;
    }

    async findCriticalDeploymentFiles() {
        this.log('Finding critical deployment files...');
        
        const critical = {
            found: {},
            missing: []
        };

        const criticalFiles = {
            'deploy-one-click.sh': 'One-click deployment script',
            '.env.example': 'Environment template',
            '.env.production.example': 'Production environment template', 
            'docker-compose.yml': 'Docker Compose configuration',
            'Dockerfile': 'Docker container definition',
            'package.json': 'Node.js dependencies',
            'ONE-CLICK-DEPLOY.md': 'Deployment documentation'
        };

        for (const [filename, description] of Object.entries(criticalFiles)) {
            const found = this.foundDocuments.has(filename) || this.foundTemplates.has(filename);
            
            if (found) {
                const fileInfo = this.foundDocuments.get(filename) || this.foundTemplates.get(filename);
                critical.found[filename] = {
                    description,
                    path: fileInfo.path,
                    valid: !this.validationResults.get(fileInfo.path)?.issues?.length
                };
            } else {
                critical.missing.push({ filename, description });
            }
        }

        return critical;
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        projectRoot: process.cwd()
    };

    // Check for custom project root
    const rootIndex = args.findIndex(arg => arg === '--root');
    if (rootIndex !== -1 && args[rootIndex + 1]) {
        options.projectRoot = args[rootIndex + 1];
    }

    try {
        console.log('🔍 EchoTune AI - MCP Document and Template Finder');
        console.log('================================================');
        console.log(`Project Root: ${options.projectRoot}\n`);

        const finder = new MCPDocumentFinder(options);

        // Discover files
        await finder.findDocumentationFiles();
        await finder.findTemplateFiles();

        // Generate report
        const report = await finder.generateReport();
        
        // Display summary
        console.log('📊 Discovery Summary:');
        console.log(`├── Documentation files: ${report.summary.documentationFiles}`);
        console.log(`├── Template files: ${report.summary.templateFiles}`);
        console.log(`└── Validation issues: ${report.summary.validationIssues}\n`);

        // Show critical files status
        const critical = await finder.findCriticalDeploymentFiles();
        console.log('🎯 Critical Deployment Files:');
        
        for (const [filename, info] of Object.entries(critical.found)) {
            const status = info.valid ? '✅' : '⚠️';
            console.log(`├── ${status} ${filename} - ${info.description}`);
        }
        
        for (const missing of critical.missing) {
            console.log(`├── ❌ ${missing.filename} - ${missing.description} (MISSING)`);
        }
        
        console.log('');

        // Export detailed report if requested
        if (args.includes('--export')) {
            const reportPath = path.join(options.projectRoot, 'mcp-document-report.json');
            await finder.exportReport(reportPath);
        }

        // Exit with error code if critical files are missing or have issues
        const hasIssues = critical.missing.length > 0 || 
                         Object.values(critical.found).some(info => !info.valid);
        
        if (hasIssues) {
            console.log('⚠️  Some critical files are missing or have validation issues.');
            console.log('Run with --verbose for detailed information.');
            process.exit(1);
        } else {
            console.log('✅ All critical deployment files found and validated.');
            process.exit(0);
        }

    } catch (error) {
        console.error('❌ Error during document discovery:', error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Export for use as module
module.exports = MCPDocumentFinder;

// Run as CLI if called directly
if (require.main === module) {
    main();
}