# GitHub Workflows Optimization

This directory has been optimized to use a single, comprehensive CI/CD pipeline instead of multiple scattered workflow files.

## Current Workflow

- **`ci-cd.yml`** - Modern, comprehensive CI/CD pipeline that handles:
  - Code quality and linting
  - Testing (unit, integration, e2e)
  - Security scanning
  - MCP server integration tests  
  - Docker build and deployment
  - Health checks and monitoring
  - Automated notifications

## Legacy Workflows (Archived)

The following workflows have been consolidated into the main `ci-cd.yml`:

- `deploy-one-click.yml` - Deployment automation
- `gemini-enhanced.yml` - AI code review integration
- `main.yml` - Basic CI/CD pipeline
- `mcp-integration.yml` - MCP server testing
- `optimized-pipeline.yml` - Previous optimization attempt
- `prompt-orchestrator.yml` - Prompt management
- `status-notifications.yml` - Status notifications
- `unified-optimized-pipeline.yml` - Previous unification attempt

## Benefits of Consolidation

✅ **Simplified Management** - Single workflow to maintain  
✅ **Better Performance** - Optimized job dependencies and parallelization  
✅ **Consistent Environment** - Standardized build environment across all jobs  
✅ **Cost Effective** - Reduced GitHub Actions minutes usage  
✅ **Easier Debugging** - Centralized workflow logic  

## Usage

The new workflow automatically triggers on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches  
- Manual workflow dispatch

All previous functionality is preserved and enhanced in the new unified pipeline.