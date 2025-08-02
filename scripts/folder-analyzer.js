#!/usr/bin/env node

/**
 * Enhanced Folder Analysis Tool for Large Repositories
 * Uses MCP filesystem tools for efficient analysis and performance optimization
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

class FolderAnalyzer {
    constructor(options = {}) {
        this.rootPath = options.rootPath || process.cwd();
        this.maxDepth = options.maxDepth || 5;
        this.excludePatterns = options.excludePatterns || [
            'node_modules',
            '.git',
            'dist',
            'build',
            '.cache',
            'tmp',
            'temp',
            '*.log'
        ];
        this.includeHidden = options.includeHidden || false;
        this.results = {
            summary: {},
            directories: [],
            files: [],
            dependencies: {},
            performance: {},
            errors: []
        };
    }

    /**
     * Main analysis function
     */
    async analyze() {
        console.log('🔍 Starting comprehensive folder analysis...');
        const startTime = performance.now();

        try {
            // Run all analysis tasks
            await Promise.all([
                this.analyzeFolderStructure(),
                this.analyzeFileTypes(),
                this.analyzeDependencies(),
                this.analyzeGitRepository(),
                this.analyzeLargeFiles(),
                this.analyzePermissions()
            ]);

            // Calculate performance metrics
            const endTime = performance.now();
            this.results.performance.totalTime = Math.round(endTime - startTime);
            this.results.performance.timestamp = new Date().toISOString();

            // Generate summary
            this.generateSummary();

            console.log('✅ Analysis completed successfully');
            return this.results;
        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            this.results.errors.push({
                type: 'ANALYSIS_ERROR',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Analyze folder structure efficiently
     */
    async analyzeFolderStructure() {
        console.log('📁 Analyzing folder structure...');
        
        const structure = {
            totalDirectories: 0,
            totalFiles: 0,
            totalSize: 0,
            maxDepth: 0,
            directoryTree: {}
        };

        try {
            await this.walkDirectory(this.rootPath, 0, structure);
            this.results.directories = structure;
        } catch (error) {
            this.results.errors.push({
                type: 'FOLDER_STRUCTURE_ERROR',
                message: error.message
            });
        }
    }

    /**
     * Recursively walk directory with performance optimization
     */
    async walkDirectory(dirPath, depth, structure) {
        if (depth > this.maxDepth) return;

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (this.shouldExclude(entry.name)) continue;
                
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    structure.totalDirectories++;
                    structure.maxDepth = Math.max(structure.maxDepth, depth + 1);
                    
                    // Recursively analyze subdirectory
                    await this.walkDirectory(fullPath, depth + 1, structure);
                } else if (entry.isFile()) {
                    structure.totalFiles++;
                    
                    try {
                        const stats = await fs.stat(fullPath);
                        structure.totalSize += stats.size;
                    } catch (error) {
                        // Skip files we can't access
                        this.results.errors.push({
                            type: 'FILE_ACCESS_ERROR',
                            path: fullPath,
                            message: error.message
                        });
                    }
                }
            }
        } catch (error) {
            this.results.errors.push({
                type: 'DIRECTORY_ACCESS_ERROR',
                path: dirPath,
                message: error.message
            });
        }
    }

    /**
     * Analyze file types and extensions
     */
    async analyzeFileTypes() {
        console.log('📄 Analyzing file types...');
        
        const fileTypes = new Map();
        const largeFiles = [];
        const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB

        try {
            await this.walkDirectoryForFiles(this.rootPath, 0, (filePath, stats) => {
                const ext = path.extname(filePath).toLowerCase();
                const category = this.categorizeFile(ext);
                
                if (!fileTypes.has(category)) {
                    fileTypes.set(category, {
                        count: 0,
                        totalSize: 0,
                        extensions: new Set()
                    });
                }
                
                const typeData = fileTypes.get(category);
                typeData.count++;
                typeData.totalSize += stats.size;
                if (ext) typeData.extensions.add(ext);

                // Track large files
                if (stats.size > LARGE_FILE_THRESHOLD) {
                    largeFiles.push({
                        path: filePath,
                        size: stats.size,
                        sizeHuman: this.formatBytes(stats.size)
                    });
                }
            });

            this.results.files = {
                types: Object.fromEntries(
                    Array.from(fileTypes.entries()).map(([key, value]) => [
                        key,
                        {
                            ...value,
                            extensions: Array.from(value.extensions),
                            averageSize: value.count > 0 ? Math.round(value.totalSize / value.count) : 0,
                            totalSizeHuman: this.formatBytes(value.totalSize)
                        }
                    ])
                ),
                largeFiles: largeFiles.sort((a, b) => b.size - a.size).slice(0, 20)
            };
        } catch (error) {
            this.results.errors.push({
                type: 'FILE_TYPES_ERROR',
                message: error.message
            });
        }
    }

    /**
     * Walk directory for file analysis
     */
    async walkDirectoryForFiles(dirPath, depth, fileCallback) {
        if (depth > this.maxDepth) return;

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (this.shouldExclude(entry.name)) continue;
                
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    await this.walkDirectoryForFiles(fullPath, depth + 1, fileCallback);
                } else if (entry.isFile()) {
                    try {
                        const stats = await fs.stat(fullPath);
                        fileCallback(fullPath, stats);
                    } catch (error) {
                        // Skip files we can't access
                    }
                }
            }
        } catch (error) {
            // Skip directories we can't access
        }
    }

    /**
     * Analyze dependencies from package.json, requirements.txt, etc.
     */
    async analyzeDependencies() {
        console.log('📦 Analyzing dependencies...');
        
        const dependencies = {
            npm: { found: false, dependencies: {}, devDependencies: {}, total: 0 },
            python: { found: false, dependencies: [], total: 0 },
            docker: { found: false, services: [], images: [] },
            other: []
        };

        try {
            // Analyze package.json
            const packageJsonPath = path.join(this.rootPath, 'package.json');
            try {
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
                dependencies.npm.found = true;
                dependencies.npm.dependencies = packageJson.dependencies || {};
                dependencies.npm.devDependencies = packageJson.devDependencies || {};
                dependencies.npm.total = Object.keys(dependencies.npm.dependencies).length + 
                                         Object.keys(dependencies.npm.devDependencies).length;
                dependencies.npm.scripts = Object.keys(packageJson.scripts || {});
                dependencies.npm.name = packageJson.name;
                dependencies.npm.version = packageJson.version;
            } catch (error) {
                // No package.json or parsing error
            }

            // Analyze requirements.txt
            const requirementsPath = path.join(this.rootPath, 'requirements.txt');
            try {
                const requirements = await fs.readFile(requirementsPath, 'utf8');
                dependencies.python.found = true;
                dependencies.python.dependencies = requirements
                    .split('\n')
                    .filter(line => line.trim() && !line.startsWith('#'))
                    .map(line => line.trim());
                dependencies.python.total = dependencies.python.dependencies.length;
            } catch (error) {
                // No requirements.txt
            }

            // Analyze docker-compose.yml
            const dockerComposePath = path.join(this.rootPath, 'docker-compose.yml');
            try {
                const dockerCompose = await fs.readFile(dockerComposePath, 'utf8');
                dependencies.docker.found = true;
                // Basic parsing - could be enhanced with yaml parser
                const serviceMatches = dockerCompose.match(/^\s+\w+:/gm);
                if (serviceMatches) {
                    dependencies.docker.services = serviceMatches.map(match => match.trim().replace(':', ''));
                }
                const imageMatches = dockerCompose.match(/image:\s*(.+)/g);
                if (imageMatches) {
                    dependencies.docker.images = imageMatches.map(match => 
                        match.replace(/image:\s*/, '').trim()
                    );
                }
            } catch (error) {
                // No docker-compose.yml
            }

            this.results.dependencies = dependencies;
        } catch (error) {
            this.results.errors.push({
                type: 'DEPENDENCIES_ERROR',
                message: error.message
            });
        }
    }

    /**
     * Analyze Git repository information
     */
    async analyzeGitRepository() {
        console.log('🔧 Analyzing Git repository...');
        
        const gitInfo = {
            isGitRepo: false,
            branch: null,
            commit: null,
            remotes: [],
            status: null
        };

        try {
            // Check if it's a git repository
            const gitDir = path.join(this.rootPath, '.git');
            try {
                await fs.access(gitDir);
                gitInfo.isGitRepo = true;
            } catch (error) {
                this.results.git = gitInfo;
                return;
            }

            // Get current branch
            try {
                gitInfo.branch = await this.runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
            } catch (error) {
                // Ignore error
            }

            // Get current commit
            try {
                gitInfo.commit = await this.runGitCommand(['rev-parse', '--short', 'HEAD']);
            } catch (error) {
                // Ignore error
            }

            // Get remotes
            try {
                const remotesOutput = await this.runGitCommand(['remote', '-v']);
                gitInfo.remotes = remotesOutput.split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        const [name, url, type] = line.split(/\s+/);
                        return { name, url, type: type ? type.replace(/[()]/g, '') : 'fetch' };
                    });
            } catch (error) {
                // Ignore error
            }

            this.results.git = gitInfo;
        } catch (error) {
            this.results.errors.push({
                type: 'GIT_ERROR',
                message: error.message
            });
        }
    }

    /**
     * Run git command and return output
     */
    async runGitCommand(args) {
        return new Promise((resolve, reject) => {
            const git = spawn('git', args, { cwd: this.rootPath });
            let output = '';
            let error = '';

            git.stdout.on('data', (data) => {
                output += data.toString();
            });

            git.stderr.on('data', (data) => {
                error += data.toString();
            });

            git.on('close', (code) => {
                if (code === 0) {
                    resolve(output.trim());
                } else {
                    reject(new Error(error.trim() || `Git command failed with code ${code}`));
                }
            });
        });
    }

    /**
     * Analyze large files that might affect performance
     */
    async analyzeLargeFiles() {
        console.log('📊 Analyzing large files...');
        // This is already handled in analyzeFileTypes()
    }

    /**
     * Analyze file permissions
     */
    async analyzePermissions() {
        console.log('🔐 Analyzing permissions...');
        
        const permissions = {
            readable: 0,
            writable: 0,
            executable: 0,
            issues: []
        };

        try {
            await this.walkDirectoryForFiles(this.rootPath, 0, async (filePath, stats) => {
                try {
                    await fs.access(filePath, fs.constants.R_OK);
                    permissions.readable++;
                } catch (error) {
                    permissions.issues.push({
                        path: filePath,
                        issue: 'not_readable'
                    });
                }

                try {
                    await fs.access(filePath, fs.constants.W_OK);
                    permissions.writable++;
                } catch (error) {
                    // Not writable - usually normal
                }

                try {
                    await fs.access(filePath, fs.constants.X_OK);
                    if (path.extname(filePath) === '.sh' || stats.mode & parseInt('111', 8)) {
                        permissions.executable++;
                    }
                } catch (error) {
                    // Not executable - usually normal
                }
            });

            this.results.permissions = permissions;
        } catch (error) {
            this.results.errors.push({
                type: 'PERMISSIONS_ERROR',
                message: error.message
            });
        }
    }

    /**
     * Generate analysis summary
     */
    generateSummary() {
        this.results.summary = {
            totalDirectories: this.results.directories.totalDirectories || 0,
            totalFiles: this.results.directories.totalFiles || 0,
            totalSize: this.formatBytes(this.results.directories.totalSize || 0),
            hasNodeProject: this.results.dependencies.npm.found,
            hasPythonProject: this.results.dependencies.python.found,
            hasDockerProject: this.results.dependencies.docker.found,
            isGitRepository: this.results.git?.isGitRepo || false,
            largeFilesCount: this.results.files?.largeFiles?.length || 0,
            errorsCount: this.results.errors.length,
            analysisTime: `${this.results.performance.totalTime}ms`
        };
    }

    /**
     * Check if file/directory should be excluded
     */
    shouldExclude(name) {
        if (!this.includeHidden && name.startsWith('.')) {
            return true;
        }

        return this.excludePatterns.some(pattern => {
            if (pattern.includes('*')) {
                // Simple glob matching
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(name);
            }
            return name === pattern;
        });
    }

    /**
     * Categorize file by extension
     */
    categorizeFile(extension) {
        const categories = {
            'source': ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs'],
            'web': ['.html', '.css', '.scss', '.sass', '.less'],
            'config': ['.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.env'],
            'documentation': ['.md', '.txt', '.rst', '.doc', '.docx', '.pdf'],
            'images': ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'],
            'media': ['.mp4', '.avi', '.mov', '.mp3', '.wav', '.ogg'],
            'data': ['.csv', '.xml', '.sql', '.db', '.sqlite'],
            'archive': ['.zip', '.tar', '.gz', '.rar', '.7z']
        };

        for (const [category, extensions] of Object.entries(categories)) {
            if (extensions.includes(extension)) {
                return category;
            }
        }

        return 'other';
    }

    /**
     * Format bytes to human readable format
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Save analysis results to file
     */
    async saveResults(outputPath = 'folder-analysis.json') {
        try {
            await fs.writeFile(outputPath, JSON.stringify(this.results, null, 2), 'utf8');
            console.log(`📄 Results saved to: ${outputPath}`);
        } catch (error) {
            console.error('❌ Failed to save results:', error.message);
        }
    }

    /**
     * Print summary to console
     */
    printSummary() {
        console.log('\n📊 Analysis Summary');
        console.log('==================');
        console.log(`Total Directories: ${this.results.summary.totalDirectories}`);
        console.log(`Total Files: ${this.results.summary.totalFiles}`);
        console.log(`Total Size: ${this.results.summary.totalSize}`);
        console.log(`Analysis Time: ${this.results.summary.analysisTime}`);
        console.log(`\nProject Types:`);
        console.log(`- Node.js: ${this.results.summary.hasNodeProject ? '✅' : '❌'}`);
        console.log(`- Python: ${this.results.summary.hasPythonProject ? '✅' : '❌'}`);
        console.log(`- Docker: ${this.results.summary.hasDockerProject ? '✅' : '❌'}`);
        console.log(`- Git Repository: ${this.results.summary.isGitRepository ? '✅' : '❌'}`);
        
        if (this.results.summary.largeFilesCount > 0) {
            console.log(`\n⚠️  Large Files: ${this.results.summary.largeFilesCount} files > 10MB`);
        }
        
        if (this.results.summary.errorsCount > 0) {
            console.log(`\n❌ Errors: ${this.results.summary.errorsCount} issues encountered`);
        }
    }
}

// CLI functionality
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        rootPath: args[0] || process.cwd(),
        maxDepth: 5,
        includeHidden: args.includes('--include-hidden'),
        excludePatterns: [
            'node_modules',
            '.git',
            'dist',
            'build',
            '.cache',
            'tmp',
            'temp',
            '*.log'
        ]
    };

    if (args.includes('--help')) {
        console.log(`
Enhanced Folder Analyzer for Large Repositories

Usage: node folder-analyzer.js [path] [options]

Options:
  --include-hidden    Include hidden files and directories
  --help             Show this help message

Examples:
  node folder-analyzer.js                    # Analyze current directory
  node folder-analyzer.js /path/to/project   # Analyze specific directory
  node folder-analyzer.js --include-hidden   # Include hidden files

The analyzer will generate a detailed report and save it as folder-analysis.json
        `);
        process.exit(0);
    }

    const analyzer = new FolderAnalyzer(options);
    
    analyzer.analyze()
        .then(async (results) => {
            analyzer.printSummary();
            await analyzer.saveResults();
            console.log('\n✅ Analysis completed successfully!');
        })
        .catch((error) => {
            console.error('\n❌ Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = FolderAnalyzer;