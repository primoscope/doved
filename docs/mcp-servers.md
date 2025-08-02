# MCP Servers Setup and Configuration Guide

This document provides comprehensive instructions for setting up and using the Model Context Protocol (MCP) servers integrated into EchoTune AI.

## Overview

EchoTune AI now includes four powerful MCP servers to enhance coding, task management, testing, and automation capabilities:

1. **Sequential Thinking MCP Server** - Structured reasoning and complex problem solving
2. **FileScopeMCP** - Advanced file system operations with scope control
3. **MCP Screenshot Website Fast** - Rapid website screenshot generation
4. **MCP Server Browserbase** - Cloud-based browser automation

## Quick Start

### Installation

```bash
# Install all MCP servers
npm run mcp-install

# Install specific server
npm run mcp-manage install sequential-thinking
npm run mcp-manage install screenshot-website
```

### Health Check

```bash
# Check all servers
npm run mcp-health

# Generate detailed report
npm run mcp-report
```

### Testing

```bash
# Test all servers
npm run mcp-test-all

# Test specific server
npm run mcp-manage test sequential-thinking
```

## Individual Server Configuration

### 1. Sequential Thinking MCP Server

**Purpose**: Provides structured thinking and reasoning capabilities for complex tasks, optimized for GitHub Coding Agent workflows.

**Location**: `mcp-servers/sequential-thinking/`

**Configuration**:
```json
{
  "command": "node",
  "args": ["mcp-servers/sequential-thinking/dist/index.js"],
  "description": "Structured thinking and reasoning capabilities"
}
```

**Usage Examples**:
- Breaking down complex coding tasks into manageable steps
- Analyzing requirements and creating implementation plans
- Debugging complex issues with systematic approach
- Code review and architectural decision making

**Environment Variables**: None required

### 2. FileScopeMCP

**Purpose**: Advanced file system operations with scope control, perfect for repository management and automated file operations.

**Location**: `node_modules/FileScopeMCP/` (npm dependency)

**Configuration**:
```json
{
  "command": "node",
  "args": ["node_modules/FileScopeMCP/dist/index.js"],
  "env": {
    "ALLOWED_DIRECTORIES": "${PWD},${PWD}/src,${PWD}/scripts,${PWD}/mcp-server"
  }
}
```

**Usage Examples**:
- Automated code generation and file manipulation
- Repository-wide refactoring operations
- Batch file processing and organization
- Secure file operations with directory restrictions

**Environment Variables**:
- `ALLOWED_DIRECTORIES`: Comma-separated list of allowed directories for security

### 3. MCP Screenshot Website Fast

**Purpose**: Fast website screenshot capabilities for documentation, testing, and UI validation.

**Location**: `mcp-servers/screenshot-website/`

**Configuration**:
```json
{
  "command": "node",
  "args": ["mcp-servers/screenshot-website/dist/index.js"],
  "description": "Fast website screenshot capabilities"
}
```

**Usage Examples**:
- Automated UI testing and visual regression testing
- Documentation generation with website screenshots
- Monitoring and validation of deployed applications
- Creating visual evidence for bug reports

**Environment Variables**: None required (uses headless browser by default)

### 4. MCP Server Browserbase

**Purpose**: Cloud-based browser automation for comprehensive web testing and interaction.

**Location**: Referenced as npm dependency

**Configuration**:
```json
{
  "command": "npx",
  "args": ["@browserbasehq/mcp-server-browserbase"],
  "env": {
    "BROWSERBASE_API_KEY": "${BROWSERBASE_API_KEY}",
    "BROWSERBASE_PROJECT_ID": "${BROWSERBASE_PROJECT_ID}"
  }
}
```

**Usage Examples**:
- End-to-end testing of web applications
- Automated user workflow testing
- Cross-browser compatibility testing
- Performance monitoring and optimization

**Environment Variables**:
- `BROWSERBASE_API_KEY`: Your Browserbase API key
- `BROWSERBASE_PROJECT_ID`: Your Browserbase project ID
- `BROWSERBASE_SESSION_ID`: Optional session ID for specific tests

## Environment Configuration

### Required Environment Variables

Add these to your `.env` file:

```env
# MCP Server Configuration
MCP_SEQUENTIAL_THINKING_ENABLED=true
MCP_SCREENSHOT_WEBSITE_ENABLED=true
MCP_BROWSERBASE_ENABLED=false  # Set to true when you have API keys
MCP_FILESYSTEM_ENABLED=true

# Browserbase Configuration (optional)
BROWSERBASE_API_KEY=your_api_key_here
BROWSERBASE_PROJECT_ID=your_project_id_here
BROWSERBASE_SESSION_ID=your_session_id_here
```

### Security Configuration

FileScopeMCP includes directory restrictions for security:

```env
# Allowed directories for file operations
ALLOWED_DIRECTORIES=/home/runner/work/Spotify-echo/Spotify-echo,/home/runner/work/Spotify-echo/Spotify-echo/src,/home/runner/work/Spotify-echo/Spotify-echo/scripts
```

## GitHub Workflow Integration

### Automated CI/CD

The MCP servers are integrated into GitHub Actions workflows:

```yaml
# .github/workflows/mcp-integration.yml
- name: Install MCP servers
  run: npm run mcp-install

- name: Health check
  run: npm run mcp-health

- name: Run tests
  run: npm run test:integration -- tests/integration/mcp-servers.test.js
```

### Manual Workflow Dispatch

You can manually trigger MCP server testing through GitHub Actions:

1. Go to Actions tab in your repository
2. Select "MCP Servers Integration" workflow
3. Click "Run workflow"
4. Choose the branch and options

## Management Commands

### Available npm Scripts

```bash
# MCP Management
npm run mcp-manage              # Show help
npm run mcp-install             # Install all servers
npm run mcp-health              # Health check
npm run mcp-test-all            # Test all servers
npm run mcp-report              # Generate report

# Individual Server Management
npm run mcp-manage install <server-name>
npm run mcp-manage test <server-name>
npm run mcp-manage health
```

### Direct Script Usage

```bash
# Using the management script directly
node scripts/mcp-manager.js health
node scripts/mcp-manager.js install sequential-thinking
node scripts/mcp-manager.js test screenshot-website
node scripts/mcp-manager.js report
```

## Troubleshooting

### Common Issues

#### Server Not Found
```bash
❌ Sequential Thinking: missing
```
**Solution**: Run `npm run mcp-install` to install missing servers

#### Build Failures
```bash
Error: Cannot build server
```
**Solutions**:
1. Check Node.js version (requires 20+)
2. Install TypeScript: `npm install -g typescript`
3. Clear node_modules and reinstall: `rm -rf node_modules && npm install`

#### Permission Errors (FileScopeMCP)
```bash
Error: Directory not allowed
```
**Solution**: Update `ALLOWED_DIRECTORIES` in `.env` to include required paths

#### Browserbase Authentication
```bash
Authentication failed
```
**Solution**: Verify `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` in `.env`

### Health Check Debugging

```bash
# Detailed health check
npm run mcp-health

# Generate diagnostic report
npm run mcp-report

# Check individual server
node scripts/mcp-manager.js test sequential-thinking
```

### Manual Server Testing

```bash
# Test sequential thinking server directly
cd mcp-servers/sequential-thinking
node dist/index.js

# Test screenshot server directly
cd mcp-servers/screenshot-website
node dist/index.js --help
```

## Performance Optimization

### Parallel Server Startup

For faster development, start multiple servers in parallel:

```bash
# Start all MCP servers in background
npm run mcp-server &
npm run mcp-manage test sequential-thinking &
npm run mcp-manage test screenshot-website &
wait
```

### Resource Management

- Sequential Thinking: ~50MB RAM
- Screenshot Website: ~100MB RAM (includes browser)
- FileScopeMCP: ~20MB RAM
- Browserbase: ~10MB RAM (cloud-based)

## Integration Examples

### Coding Agent Workflow

```javascript
// Example: Using Sequential Thinking for complex problem solving
const sequentialThinking = new SequentialThinkingClient();
const analysis = await sequentialThinking.analyzeRequirement({
  task: "Implement user authentication system",
  complexity: "high",
  timeframe: "2 days"
});
console.log(analysis.steps);
```

### Automated Testing Workflow

```javascript
// Example: Screenshot testing in CI/CD
const screenshot = new ScreenshotClient();
const image = await screenshot.capture({
  url: "http://localhost:3000",
  viewport: { width: 1920, height: 1080 },
  format: "png"
});
```

### File Processing Workflow

```javascript
// Example: Automated file operations with FileScopeMCP
const fileScope = new FileScopeClient();
await fileScope.processFiles({
  pattern: "**/*.js",
  operation: "lint-and-format",
  allowedDirs: ["/src", "/scripts"]
});
```

## Advanced Configuration

### Custom Server Configurations

You can extend the MCP configuration in `package.json`:

```json
{
  "mcp": {
    "servers": {
      "custom-server": {
        "command": "node",
        "args": ["path/to/custom/server.js"],
        "env": {
          "CUSTOM_ENV": "value"
        }
      }
    }
  }
}
```

### Production Deployment

For production deployments:

1. **Set appropriate environment variables**
2. **Configure resource limits**
3. **Set up monitoring and health checks**
4. **Enable logging and error tracking**

```bash
# Production health monitoring
watch -n 30 "npm run mcp-health"

# Log monitoring
tail -f logs/mcp-servers.log
```

## Contributing

### Adding New MCP Servers

1. Clone the server repository to `mcp-servers/`
2. Update `scripts/mcp-manager.js` to include the new server
3. Add configuration to `package.json`
4. Update environment variables in `.env.example`
5. Add tests in `tests/integration/mcp-servers.test.js`
6. Update this documentation

### Testing Guidelines

- All servers must pass health checks
- Integration tests should cover basic functionality
- Performance tests should validate resource usage
- Security tests should verify access controls

## Support

For issues and feature requests:

1. Check the [troubleshooting section](#troubleshooting)
2. Run diagnostics: `npm run mcp-report`
3. Check logs and error messages
4. Create an issue with detailed reproduction steps

---

**EchoTune AI MCP Integration** - Enhancing coding productivity through intelligent automation