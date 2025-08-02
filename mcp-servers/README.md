# MCP Servers Configuration

This directory contains the configuration and installation for various Model Context Protocol (MCP) servers used in EchoTune AI.

## Installed Servers

### 1. Sequential Thinking MCP Server
- **Repository**: https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking
- **Purpose**: Provides structured thinking and reasoning capabilities for complex tasks
- **Location**: `./sequential-thinking/`

### 2. FileScopeMCP
- **Repository**: https://github.com/admica/FileScopeMCP
- **Purpose**: File system operations and repository management with scope control
- **Location**: Referenced as npm dependency

### 3. MCP Screenshot Website Fast
- **Repository**: https://github.com/just-every/mcp-screenshot-website-fast
- **Purpose**: Fast website screenshot capabilities for automation
- **Location**: `./screenshot-website/`

### 4. MCP Server Browserbase
- **Repository**: https://github.com/browserbase/mcp-server-browserbase
- **Purpose**: Cloud browser automation for web interactions
- **Location**: Referenced as npm dependency

## Usage

Each server can be started individually or as part of the main MCP orchestrator. See the main project documentation for integration details.

## Configuration

Server configurations are managed through:
- `package.json` - MCP server definitions
- `.env` - Environment variables
- `../mcp-server/` - Main orchestrator and integration scripts