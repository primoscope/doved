
/**
 * FileScopeMCP Operation Handlers for EchoTune AI
 * Provides advanced file operations with security and performance monitoring
 */

const fs = require('fs').promises;
const path = require('path');
const { FileScopeSecurity } = require('./filescope-security');

class FileScopeHandlers {
    constructor(config) {
        this.security = new FileScopeSecurity(
            config.security.allowedDirectories,
            config.security.allowedExtensions
        );
        this.config = config;
    }

    async readFile(filePath, options = {}) {
        try {
            const validatedPath = this.security.validatePath(filePath);
            const content = await fs.readFile(validatedPath, options.encoding || 'utf8');
            
            this.security.logOperation('read', filePath, true, { 
                size: content.length,
                encoding: options.encoding || 'utf8'
            });
            
            return {
                success: true,
                content,
                metadata: {
                    path: validatedPath,
                    size: content.length,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            this.security.logOperation('read', filePath, false, { error: error.message });
            throw error;
        }
    }

    async writeFile(filePath, content, options = {}) {
        try {
            const validatedPath = this.security.validatePath(filePath);
            
            // Check if directory exists, create if needed
            await fs.mkdir(path.dirname(validatedPath), { recursive: true });
            
            await fs.writeFile(validatedPath, content, options);
            
            this.security.logOperation('write', filePath, true, {
                size: content.length,
                created: !await this.fileExists(validatedPath)
            });
            
            return {
                success: true,
                path: validatedPath,
                size: content.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.security.logOperation('write', filePath, false, { error: error.message });
            throw error;
        }
    }

    async createFile(filePath, content = '', options = {}) {
        try {
            const validatedPath = this.security.validatePath(filePath);
            
            // Check if file already exists
            if (await this.fileExists(validatedPath)) {
                throw new Error(`File already exists: ${validatedPath}`);
            }
            
            return await this.writeFile(filePath, content, options);
        } catch (error) {
            this.security.logOperation('create', filePath, false, { error: error.message });
            throw error;
        }
    }

    async copyFile(sourcePath, destPath, options = {}) {
        try {
            const validatedSource = this.security.validatePath(sourcePath);
            const validatedDest = this.security.validatePath(destPath);
            
            await fs.mkdir(path.dirname(validatedDest), { recursive: true });
            await fs.copyFile(validatedSource, validatedDest);
            
            this.security.logOperation('copy', sourcePath, true, {
                destination: destPath,
                overwrite: options.overwrite || false
            });
            
            return {
                success: true,
                source: validatedSource,
                destination: validatedDest,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.security.logOperation('copy', sourcePath, false, { error: error.message });
            throw error;
        }
    }

    async listDirectory(dirPath, options = {}) {
        try {
            const validatedPath = this.security.validatePath(dirPath);
            const items = await fs.readdir(validatedPath, { withFileTypes: true });
            
            const result = items.map(item => ({
                name: item.name,
                type: item.isDirectory() ? 'directory' : 'file',
                path: path.join(validatedPath, item.name)
            }));
            
            this.security.logOperation('list', dirPath, true, { itemCount: result.length });
            
            return {
                success: true,
                items: result,
                path: validatedPath,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.security.logOperation('list', dirPath, false, { error: error.message });
            throw error;
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async getFileStats(filePath) {
        try {
            const validatedPath = this.security.validatePath(filePath);
            const stats = await fs.stat(validatedPath);
            
            return {
                success: true,
                stats: {
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    isFile: stats.isFile(),
                    isDirectory: stats.isDirectory()
                },
                path: validatedPath
            };
        } catch (error) {
            throw error;
        }
    }

    getAuditTrail() {
        return this.security.getAuditTrail();
    }
}

module.exports = { FileScopeHandlers };
