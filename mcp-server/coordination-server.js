
/**
 * MCP Coordination Server for EchoTune AI
 * Central coordination point for all MCP operations
 */

const express = require('express');
const { MCPWorkflowManager } = require('./workflow-manager');
const path = require('path');

class MCPCoordinationServer {
    constructor(config) {
        this.config = config;
        this.app = express();
        this.workflowManager = new MCPWorkflowManager(config);
        this.isReady = false;
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static('mcp-reports'));
        
        // CORS for development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                isReady: this.isReady,
                servers: Object.keys(this.config.servers).length,
                activeWorkflows: this.workflowManager.orchestrationEngine.activeWorkflows.size,
                timestamp: new Date().toISOString()
            });
        });

        // Get orchestration status
        this.app.get('/status', async (req, res) => {
            try {
                const status = await this.workflowManager.orchestrationEngine.getOrchestrationStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // List workflows
        this.app.get('/workflows', (req, res) => {
            const workflows = this.workflowManager.orchestrationEngine.listWorkflows();
            res.json({ workflows });
        });

        // Execute workflow
        this.app.post('/workflows/:id/execute', async (req, res) => {
            try {
                const { id } = req.params;
                const { options = {} } = req.body;
                
                const execution = await this.workflowManager.orchestrationEngine.executeWorkflow(id, options);
                res.json(execution);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Create custom workflow
        this.app.post('/workflows', async (req, res) => {
            try {
                const workflow = await this.workflowManager.createCustomWorkflow(req.body);
                res.json(workflow);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Schedule workflow
        this.app.post('/workflows/:id/schedule', async (req, res) => {
            try {
                const { id } = req.params;
                const { schedule } = req.body;
                
                const scheduledWorkflow = await this.workflowManager.scheduleWorkflow(id, schedule);
                res.json(scheduledWorkflow);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Get workflow analytics
        this.app.get('/analytics', async (req, res) => {
            try {
                const analytics = await this.workflowManager.getWorkflowAnalytics();
                res.json(analytics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // EchoTune specific endpoints
        this.app.post('/echotune/maintenance', async (req, res) => {
            try {
                const result = await this.workflowManager.runEchoTuneMaintenanceWorkflow();
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/echotune/deployment', async (req, res) => {
            try {
                const result = await this.workflowManager.runEchoTuneDeploymentWorkflow();
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Server management
        this.app.get('/servers', async (req, res) => {
            try {
                const healthChecks = await this.workflowManager.orchestrationEngine.healthCheckAllServers();
                res.json(healthChecks);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    async start() {
        await this.workflowManager.initialize();
        this.isReady = true;
        
        const port = this.config.coordinationPort || 3001;
        this.app.listen(port, () => {
            console.log(`🎼 MCP Coordination Server running on port ${port}`);
            console.log(`📊 Dashboard: http://localhost:${port}/health`);
        });
    }

    async shutdown() {
        await this.workflowManager.shutdown();
    }
}

// Configuration
const config = {
    coordinationPort: process.env.MCP_SERVER_PORT || 3001,
    projectRoot: process.cwd(),
    servers: {
        sequentialThinking: {
            name: 'Sequential Thinking',
            port: 3005,
            capabilities: ['complex-reasoning', 'task-decomposition', 'planning']
        },
        fileScopeMCP: {
            name: 'FileScopeMCP',
            port: 3003,
            capabilities: ['file-operations', 'security-scoping', 'audit-trail']
        },
        screenshotWebsite: {
            name: 'Screenshot Website Fast',
            port: 3002,
            capabilities: ['screenshot-generation', 'visual-regression', 'ui-testing']
        },
        browserbase: {
            name: 'Browserbase Integration',
            port: 3004,
            capabilities: ['cloud-automation', 'cross-browser-testing', 'performance-monitoring']
        }
    }
};

// Start server if run directly
if (require.main === module) {
    const server = new MCPCoordinationServer(config);
    server.start().catch(console.error);

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('🎼 Shutting down MCP Coordination Server...');
        server.shutdown().then(() => process.exit(0));
    });

    process.on('SIGINT', () => {
        console.log('🎼 Shutting down MCP Coordination Server...');
        server.shutdown().then(() => process.exit(0));
    });
}

module.exports = { MCPCoordinationServer };
