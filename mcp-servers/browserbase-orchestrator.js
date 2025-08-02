
/**
 * Browserbase Test Orchestrator for EchoTune AI
 * Coordinates and manages comprehensive UI testing
 */

const { BrowserbaseWorkflows } = require('./browserbase-workflows');
const fs = require('fs').promises;
const path = require('path');

class BrowserbaseOrchestrator {
    constructor(config) {
        this.config = config;
        this.workflows = new BrowserbaseWorkflows(config);
        this.testRuns = [];
        this.isRunning = false;
    }

    async orchestrateEchoTuneTesting() {
        console.log('🎵 Orchestrating comprehensive EchoTune testing...');
        
        if (this.isRunning) {
            throw new Error('Test orchestration already in progress');
        }

        this.isRunning = true;
        const orchestrationId = `orchestration_${Date.now()}`;
        
        try {
            const testPlan = {
                id: orchestrationId,
                startTime: new Date().toISOString(),
                phases: [
                    'core-functionality',
                    'mobile-responsive',
                    'performance-testing',
                    'cross-browser'
                ],
                results: {}
            };

            // Phase 1: Core Functionality
            console.log('📱 Phase 1: Core Functionality Testing');
            testPlan.results.coreFunctionality = await this.workflows.runWorkflow('echotune-core-test');

            // Phase 2: Mobile Responsive
            console.log('📱 Phase 2: Mobile Responsive Testing');
            testPlan.results.mobileResponsive = await this.workflows.runWorkflow('mobile-responsive-test');

            // Phase 3: Performance Testing
            console.log('⚡ Phase 3: Performance Testing');
            testPlan.results.performance = await this.workflows.runWorkflow('performance-test');

            // Phase 4: Cross-Browser Testing
            console.log('🌐 Phase 4: Cross-Browser Testing');
            testPlan.results.crossBrowser = await this.workflows.runWorkflow('cross-browser-test');

            testPlan.endTime = new Date().toISOString();
            testPlan.duration = new Date(testPlan.endTime) - new Date(testPlan.startTime);
            testPlan.success = Object.values(testPlan.results).every(r => r.success);

            this.testRuns.push(testPlan);
            
            // Generate comprehensive report
            const report = await this.generateTestReport(testPlan);
            
            console.log(`✅ EchoTune testing orchestration completed: ${orchestrationId}`);
            return { testPlan, report };
            
        } catch (error) {
            console.error('❌ Test orchestration failed:', error.message);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    async generateTestReport(testPlan) {
        const reportPath = path.join(this.config.projectRoot || process.cwd(), 'test-reports');
        await fs.mkdir(reportPath, { recursive: true });
        
        const report = {
            summary: {
                orchestrationId: testPlan.id,
                duration: testPlan.duration,
                success: testPlan.success,
                phases: Object.keys(testPlan.results).length,
                totalScreenshots: Object.values(testPlan.results)
                    .reduce((total, result) => total + (result.screenshots?.length || 0), 0)
            },
            phases: {},
            recommendations: [],
            timestamp: new Date().toISOString()
        };

        // Analyze each phase
        for (const [phase, result] of Object.entries(testPlan.results)) {
            report.phases[phase] = {
                success: result.success,
                duration: result.duration,
                steps: result.steps?.length || 0,
                screenshots: result.screenshots?.length || 0,
                issues: result.success ? [] : [result.error || 'Unknown error']
            };

            // Add recommendations based on results
            if (!result.success) {
                report.recommendations.push(`Fix issues in ${phase} testing`);
            }
        }

        // Performance recommendations
        if (testPlan.results.performance?.metrics) {
            const avgLoadTime = Object.values(testPlan.results.performance.metrics)
                .reduce((sum, m) => sum + (m.loadTime || 0), 0) / 
                Object.keys(testPlan.results.performance.metrics).length;
            
            if (avgLoadTime > 1000) {
                report.recommendations.push('Optimize page load times');
            }
        }

        const reportFile = path.join(reportPath, `browserbase-report-${testPlan.id}.json`);
        await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
        
        console.log(`📊 Test report generated: ${reportFile}`);
        return report;
    }

    async getTestHistory() {
        return {
            totalRuns: this.testRuns.length,
            successRate: this.testRuns.filter(r => r.success).length / this.testRuns.length,
            lastRun: this.testRuns[this.testRuns.length - 1],
            runs: this.testRuns
        };
    }

    async scheduleRegularTesting(interval = 24 * 60 * 60 * 1000) {
        console.log(`⏰ Scheduling regular EchoTune testing every ${interval}ms`);
        
        setInterval(async () => {
            try {
                console.log('🔄 Running scheduled EchoTune testing...');
                await this.orchestrateEchoTuneTesting();
            } catch (error) {
                console.error('❌ Scheduled testing failed:', error.message);
            }
        }, interval);
    }
}

module.exports = { BrowserbaseOrchestrator };
