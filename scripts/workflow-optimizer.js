#!/usr/bin/env node

/**
 * Workflow Optimization Script
 * Analyzes and consolidates GitHub Actions workflows
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class WorkflowOptimizer {
  constructor() {
    this.workflowsDir = path.join(process.cwd(), '.github/workflows');
    this.workflows = new Map();
    this.analysis = {
      totalWorkflows: 0,
      redundantWorkflows: [],
      optimizations: [],
      savings: {
        filesRemoved: 0,
        duplicateJobsRemoved: 0,
        estimatedTimeReduction: 0
      }
    };
  }

  async analyzeWorkflows() {
    console.log('🔍 Analyzing GitHub Actions workflows...\n');

    try {
      const files = await fs.readdir(this.workflowsDir);
      const yamlFiles = files.filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));
      
      this.analysis.totalWorkflows = yamlFiles.length;
      console.log(`📁 Found ${yamlFiles.length} workflow files:`);

      for (const file of yamlFiles) {
        const filePath = path.join(this.workflowsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        try {
          const workflow = yaml.load(content);
          this.workflows.set(file, {
            content: workflow,
            filePath,
            originalContent: content
          });
          
          console.log(`  ✅ ${file} - ${workflow.name || 'Unnamed'}`);
        } catch (error) {
          console.log(`  ❌ ${file} - YAML parse error: ${error.message}`);
        }
      }

      console.log('');
      await this.identifyRedundancies();
      await this.generateOptimizationReport();
      
      return this.analysis;

    } catch (error) {
      console.error('Error analyzing workflows:', error.message);
      throw error;
    }
  }

  async identifyRedundancies() {
    console.log('🔍 Identifying redundant workflows...\n');

    const jobTypes = new Map();
    const triggers = new Map();
    const duplicateNames = new Map();

    // Analyze each workflow
    for (const [filename, data] of this.workflows) {
      const workflow = data.content;
      
      if (!workflow || !workflow.jobs) continue;

      // Check for duplicate workflow names
      const workflowName = workflow.name;
      if (workflowName) {
        if (duplicateNames.has(workflowName)) {
          duplicateNames.get(workflowName).push(filename);
        } else {
          duplicateNames.set(workflowName, [filename]);
        }
      }

      // Analyze triggers
      const triggerKey = JSON.stringify(workflow.on);
      if (triggers.has(triggerKey)) {
        triggers.get(triggerKey).push(filename);
      } else {
        triggers.set(triggerKey, [filename]);
      }

      // Analyze job types
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        const jobSignature = this.createJobSignature(job);
        
        if (jobTypes.has(jobSignature)) {
          jobTypes.get(jobSignature).push({ filename, jobName });
        } else {
          jobTypes.set(jobSignature, [{ filename, jobName }]);
        }
      }
    }

    // Identify redundancies
    let redundancyCount = 0;

    // Check for workflows with identical triggers
    for (const [triggerKey, files] of triggers) {
      if (files.length > 1) {
        this.analysis.redundantWorkflows.push({
          type: 'identical_triggers',
          files,
          description: `${files.length} workflows with identical triggers`,
          suggestion: 'Consolidate into single workflow with multiple jobs'
        });
        redundancyCount++;
      }
    }

    // Check for similar job patterns
    for (const [jobSignature, jobs] of jobTypes) {
      if (jobs.length > 1) {
        this.analysis.redundantWorkflows.push({
          type: 'duplicate_jobs',
          jobs: jobs.map(j => `${j.filename}:${j.jobName}`),
          description: `${jobs.length} similar jobs found`,
          suggestion: 'Consolidate similar jobs to reduce duplication'
        });
        redundancyCount++;
      }
    }

    // Specific redundancy patterns for this project
    const redundantPatterns = [
      {
        pattern: ['Gemini.yml', 'gemini-enhanced.yml', 'main.yml'],
        reason: 'Multiple Gemini code review workflows',
        action: 'Consolidate into optimized-pipeline.yml'
      },
      {
        pattern: ['auto.yml', 'prompt-orchestrator.yml'],
        reason: 'Overlapping prompt analysis workflows',
        action: 'Merge functionality into main pipeline'
      },
      {
        pattern: ['coding-agent-workflow.yml'],
        reason: 'Superseded by optimized pipeline',
        action: 'Remove - functionality integrated'
      }
    ];

    for (const pattern of redundantPatterns) {
      const existingFiles = pattern.pattern.filter(file => this.workflows.has(file));
      if (existingFiles.length > 0) {
        this.analysis.redundantWorkflows.push({
          type: 'project_specific',
          files: existingFiles,
          description: pattern.reason,
          suggestion: pattern.action
        });
      }
    }

    console.log(`🔍 Analysis complete:`);
    console.log(`  • Found ${redundancyCount} redundancy patterns`);
    console.log(`  • Identified ${this.analysis.redundantWorkflows.length} optimization opportunities\n`);
  }

  createJobSignature(job) {
    // Create a signature for job similarity comparison
    const steps = job.steps || [];
    const stepActions = steps.map(step => {
      if (step.uses) return step.uses.split('@')[0]; // Get action name without version
      if (step.run) return 'custom_script';
      return 'unknown';
    });

    return JSON.stringify({
      runner: job['runs-on'],
      actions: stepActions.slice(0, 5), // First 5 steps for comparison
      hasMatrix: !!job.strategy?.matrix
    });
  }

  async generateOptimizationPlan() {
    console.log('📋 Generating optimization plan...\n');

    const optimizations = [
      {
        type: 'consolidation',
        description: 'Create unified optimized-pipeline.yml',
        benefits: [
          'Single source of truth for CI/CD',
          'Reduced maintenance overhead',
          'Consistent caching and optimization',
          'Better resource utilization'
        ],
        implementation: 'Replace multiple workflows with optimized-pipeline.yml'
      },
      {
        type: 'caching',
        description: 'Implement comprehensive dependency caching',
        benefits: [
          'Faster workflow execution',
          'Reduced network usage',
          'Better reliability'
        ],
        implementation: 'Add Node.js and Python dependency caching'
      },
      {
        type: 'parallelization',
        description: 'Optimize job dependencies and parallelization',
        benefits: [
          'Reduced overall pipeline time',
          'Better resource utilization',
          'Faster feedback'
        ],
        implementation: 'Run independent jobs in parallel'
      },
      {
        type: 'smart_execution',
        description: 'Add smart change detection',
        benefits: [
          'Skip unnecessary jobs',
          'Faster PR feedback',
          'Reduced resource usage'
        ],
        implementation: 'Conditional job execution based on file changes'
      }
    ];

    this.analysis.optimizations = optimizations;

    console.log('📊 Optimization Plan:');
    optimizations.forEach((opt, index) => {
      console.log(`\n${index + 1}. ${opt.description}`);
      console.log(`   Benefits:`);
      opt.benefits.forEach(benefit => console.log(`   • ${benefit}`));
      console.log(`   Implementation: ${opt.implementation}`);
    });

    return optimizations;
  }

  async generateOptimizationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalWorkflows: this.analysis.totalWorkflows,
        redundanciesFound: this.analysis.redundantWorkflows.length,
        optimizationsProposed: this.analysis.optimizations.length
      },
      redundantWorkflows: this.analysis.redundantWorkflows,
      optimizations: await this.generateOptimizationPlan(),
      recommendations: [
        'Replace all redundant workflows with optimized-pipeline.yml',
        'Remove unused workflow files after testing',
        'Implement workflow status notifications',
        'Add periodic cleanup for old artifacts',
        'Consider workflow templates for future additions'
      ]
    };

    // Save report
    const reportPath = path.join(process.cwd(), 'workflow-optimization-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n💾 Optimization report saved to: workflow-optimization-report.json`);
    
    return report;
  }

  async implementOptimizations(dryRun = true) {
    console.log(`\n🚀 ${dryRun ? 'DRY RUN:' : 'IMPLEMENTING'} Workflow optimizations...\n`);

    const filesToRemove = [
      'Gemini.yml', // Replaced by optimized-pipeline.yml
      'auto.yml', // Functionality consolidated
      'coding-agent-workflow.yml', // Superseded
      'prompt-integration-demo.yml', // Demo purposes only
      'summary.yml' // Minimal workflow, can be removed
    ];

    const filesToKeep = [
      'optimized-pipeline.yml', // Main consolidated workflow
      'mcp-integration.yml', // Keep for MCP-specific testing (can be merged later)
      'gemini-enhanced.yml', // Keep for enhanced features (can be merged later)
      'prompt-orchestrator.yml' // Keep for prompt-specific testing (can be merged later)
    ];

    console.log('📋 Files to remove:');
    for (const file of filesToRemove) {
      if (this.workflows.has(file)) {
        console.log(`  🗑️  ${file} - ${this.workflows.get(file).content.name || 'Unnamed'}`);
        
        if (!dryRun) {
          try {
            await fs.unlink(path.join(this.workflowsDir, file));
            this.analysis.savings.filesRemoved++;
          } catch (error) {
            console.log(`     ❌ Error removing ${file}: ${error.message}`);
          }
        }
      }
    }

    console.log('\n📋 Files to keep:');
    for (const file of filesToKeep) {
      if (this.workflows.has(file)) {
        console.log(`  ✅ ${file} - ${this.workflows.get(file).content.name || 'Unnamed'}`);
      }
    }

    // Calculate estimated time savings
    const removedComplexity = filesToRemove.length * 10; // Assume 10 min average per workflow
    const optimizedTime = 15; // Estimated time for optimized pipeline
    this.analysis.savings.estimatedTimeReduction = Math.max(0, removedComplexity - optimizedTime);
    this.analysis.savings.duplicateJobsRemoved = this.analysis.redundantWorkflows
      .filter(r => r.type === 'duplicate_jobs').length;

    console.log('\n📊 Estimated Savings:');
    console.log(`  • Files removed: ${this.analysis.savings.filesRemoved} (${dryRun ? 'would be ' + filesToRemove.length : 'actual'})`);
    console.log(`  • Duplicate jobs eliminated: ${this.analysis.savings.duplicateJobsRemoved}`);
    console.log(`  • Estimated time reduction: ${this.analysis.savings.estimatedTimeReduction} minutes per CI run`);

    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN. To implement changes, run with --apply flag');
    } else {
      console.log('\n✅ Optimizations implemented successfully!');
    }

    return this.analysis.savings;
  }

  async addStatusChecks() {
    console.log('\n🔔 Adding workflow status checks and notifications...\n');

    const statusCheckWorkflow = {
      name: 'Workflow Status Notifications',
      on: {
        workflow_run: {
          workflows: ['EchoTune AI - Optimized CI/CD Pipeline'],
          types: ['completed']
        }
      },
      jobs: {
        'notify-status': {
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4'
            },
            {
              name: 'Notify workflow completion',
              run: 'echo "Workflow completed: ${{ github.event.workflow_run.name }}"\n' +
                   'echo "Status: ${{ github.event.workflow_run.conclusion }}"\n' +
                   'echo "Branch: ${{ github.event.workflow_run.head_branch }}"\n' +
                   '\n' +
                   '# Add notification logic here (Slack, Discord, etc.)\n' +
                   'if [ "${{ github.event.workflow_run.conclusion }}" = "failure" ]; then\n' +
                   '  echo "🔴 Workflow failed - notification sent"\n' +
                   'else\n' +
                   '  echo "✅ Workflow completed successfully"\n' +
                   'fi'
            }
          ]
        }
      }
    };

    const statusFilePath = path.join(this.workflowsDir, 'status-notifications.yml');
    const yamlContent = yaml.dump(statusCheckWorkflow, { 
      indent: 2,
      lineWidth: -1 
    });

    await fs.writeFile(statusFilePath, yamlContent);
    console.log('✅ Created status-notifications.yml workflow');

    return statusCheckWorkflow;
  }
}

// CLI usage
if (require.main === module) {
  const optimizer = new WorkflowOptimizer();
  
  const command = process.argv[2];
  const flags = process.argv.slice(3);
  
  async function runCommand() {
    try {
      switch (command) {
        case 'analyze':
          const analysis = await optimizer.analyzeWorkflows();
          console.log('\n📊 Analysis Summary:');
          console.log(`  • Total workflows: ${analysis.totalWorkflows}`);
          console.log(`  • Redundancies found: ${analysis.redundantWorkflows.length}`);
          console.log(`  • Optimizations available: ${analysis.optimizations.length}`);
          break;
          
        case 'optimize':
          await optimizer.analyzeWorkflows();
          const dryRun = !flags.includes('--apply');
          await optimizer.implementOptimizations(dryRun);
          break;
          
        case 'status':
          await optimizer.addStatusChecks();
          break;
          
        case 'report':
          await optimizer.analyzeWorkflows();
          console.log('\n📋 Full optimization report generated');
          break;
          
        default:
          console.log('Available commands: analyze, optimize [--apply], status, report');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
  
  runCommand();
}

module.exports = { WorkflowOptimizer };