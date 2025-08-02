# MCP Servers Integration Guide

## Overview
EchoTune AI now integrates with multiple MCP (Model Context Protocol) servers to provide enhanced functionality:

## Integrated MCP Servers

### 1. Mermaid Diagram Generator (`mcp-mermaid`)
- **Purpose**: Generate workflow diagrams and visual representations
- **Capabilities**: 
  - Flowcharts for user journeys
  - Sequence diagrams for API interactions
  - Class diagrams for system architecture
  - State diagrams for application flow

**Usage Example**:
```bash
npx mcp-mermaid --input workflow.mmd --output workflow.svg
```

### 2. FileScopeMCP Repository Manager
- **Purpose**: Advanced file system operations and repository management
- **Capabilities**:
  - Intelligent file operations
  - Code analysis and refactoring
  - Repository structure management
  - Automated documentation generation

**Usage Example**:
```bash
node node_modules/FileScopeMCP/dist/index.js --analyze src/
```

### 3. Browserbase Cloud Automation
- **Purpose**: Cloud-based browser automation for testing
- **Capabilities**:
  - Web automation in real browsers
  - Cross-browser compatibility testing
  - Screenshot capture for documentation
  - Performance testing with real network conditions

**Usage Example**:
```bash
npx @browserbasehq/mcp-server-browserbase --test spotify-integration
```

## Configuration

Add the following environment variables to your `.env` file:

```env
# Browserbase Configuration
BROWSERBASE_API_KEY=your_api_key_here
BROWSERBASE_PROJECT_ID=your_project_id_here
BROWSERBASE_SESSION_ID=your_session_id_here
```

## Integration Scripts

Run the integration demonstrations:

```bash
# Run all MCP server demonstrations
node scripts/integrate-mcp-servers.js

# Test individual servers
npm run mcp-test-mermaid
npm run mcp-test-filesystem
npm run mcp-test-browserbase
```

Generated on: 2025-08-01T14:56:49.894Z
