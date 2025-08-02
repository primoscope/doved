
/**
 * FileScopeMCP Security Policy for EchoTune AI
 * Implements strict security controls for file operations
 */

class FileScopeSecurity {
    constructor(allowedDirectories, allowedExtensions) {
        this.allowedDirectories = allowedDirectories.map(dir => path.resolve(dir));
        this.allowedExtensions = allowedExtensions;
        this.operationLog = [];
    }

    validatePath(filePath) {
        const resolvedPath = path.resolve(filePath);
        
        // Check if path is within allowed directories
        const isAllowed = this.allowedDirectories.some(allowedDir => 
            resolvedPath.startsWith(allowedDir)
        );
        
        if (!isAllowed) {
            throw new Error(`Access denied: Path outside allowed directories: ${resolvedPath}`);
        }

        // Check file extension
        const ext = path.extname(resolvedPath);
        if (this.allowedExtensions.length > 0 && !this.allowedExtensions.includes(ext)) {
            throw new Error(`Access denied: File extension not allowed: ${ext}`);
        }

        return resolvedPath;
    }

    logOperation(operation, filePath, success, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            operation,
            filePath,
            success,
            details,
            id: require('crypto').randomUUID()
        };
        
        this.operationLog.push(logEntry);
        
        // Keep only last 1000 operations
        if (this.operationLog.length > 1000) {
            this.operationLog = this.operationLog.slice(-1000);
        }
        
        console.log(`FileScope ${success ? '✅' : '❌'}: ${operation} on ${filePath}`);
        return logEntry;
    }

    getAuditTrail() {
        return this.operationLog;
    }
}

module.exports = { FileScopeSecurity };
