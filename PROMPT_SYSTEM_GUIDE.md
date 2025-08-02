# EchoTune AI Prompt System Integration Guide

This document describes the new unified prompt system for EchoTune AI that enables interchangeable AI prompt execution across different workflows and automation systems.

## 🌟 Overview

The unified prompt system addresses the previous fragmentation of prompts across multiple locations and formats. It provides:

- **Standardized Format**: All prompts follow a consistent YAML schema
- **Interchangeable Execution**: Prompts can be used via CLI, GitHub Actions, or API
- **Validation & Testing**: Automated validation and testing capabilities
- **Legacy Support**: Backward compatibility with existing workflows

## 📁 Directory Structure

```
prompts/
├── README.md                    # Documentation
├── schema/
│   └── prompt-schema.json      # JSON schema for validation
├── catalog/                     # Categorized prompt library
│   ├── coding-agent/           # Development and code review
│   ├── analysis/               # Security and performance analysis
│   ├── automation/             # Process automation
│   ├── documentation/          # Documentation generation
│   └── workflow/               # CI/CD optimization
├── config/
│   └── prompt-config.yml       # System configuration
└── tools/                       # Management utilities
    ├── validator.js            # Validation tool
    ├── executor.js             # Execution engine
    └── cli.js                  # Command-line interface
```

## 🚀 Quick Start

### Installation

The prompt system is already integrated into the project. Install dependencies:

```bash
npm install
```

### Basic Usage

```bash
# List available prompts
npm run prompts:list

# Validate prompts
npm run prompts:validate

# Execute a prompt
npm run prompts:execute coding-agent/code-review-analysis --project_readme="My project"
```

### GitHub Actions Integration

Use the prompt orchestrator workflow:

```yaml
- name: AI Code Review
  uses: ./.github/workflows/prompt-orchestrator.yml
  with:
    prompt_name: 'coding-agent/code-review-analysis'
    variables: |
      {
        "project_readme": "Project description",
        "code_files": "Code to analyze"
      }
    model: 'gpt-4o'
    save_result: true
```

## 📋 Available Commands

### CLI Commands

```bash
# Prompt management
npm run prompts                 # Show help
npm run prompts:validate        # Validate all prompts
npm run prompts:list           # List available prompts
npm run prompts:execute <name> # Execute a prompt
npm run prompts:test <name>    # Test a prompt
npm run prompts:server         # Start API server

# Using the unified CLI
npm run prompts -- validate prompts/catalog
npm run prompts -- execute coding-agent/code-review --file=src/app.js
npm run prompts -- test workflow/workflow-optimizer
npm run prompts -- list coding-agent
npm run prompts -- init my-prompt --category=analysis
npm run prompts -- migrate .github/workflows/prompts/
```

### GitHub Actions

#### Manual Trigger
1. Go to Actions tab in GitHub
2. Select "EchoTune AI Prompt Orchestrator"
3. Choose prompt and provide variables
4. Run workflow

#### Programmatic Usage
```yaml
- uses: ./.github/workflows/prompt-orchestrator.yml
  with:
    prompt_name: 'category/prompt-name'
    variables: '{"key": "value"}'
    model: 'gpt-4o'
    save_result: true
```

## 🎯 Available Prompts

### Coding Agent Category
- **code-review-analysis**: Analyzes code and provides development recommendations
  - Variables: `project_readme`, `project_goals`, `code_files`
  - Use case: Pull request analysis, code quality assessment

### Workflow Category  
- **workflow-optimizer**: Optimizes GitHub Actions workflows
  - Variables: `projectType`, `currentIssues`, `performanceGoals`, etc.
  - Use case: CI/CD pipeline optimization

### Analysis Category
- **security-scanner**: Security vulnerability analysis (planned)
- **performance-analyzer**: Performance optimization suggestions (planned)

### Documentation Category
- **api-documenter**: API documentation generation (planned)
- **readme-enhancer**: README improvement suggestions (planned)

## 🔧 Configuration

### Environment Variables

Set up API keys for AI providers:

```bash
# Required for OpenAI models
export OPENAI_API_KEY="your-openai-key"

# Required for Google Gemini models  
export GOOGLE_API_KEY="your-google-key"

# Required for Anthropic Claude models
export ANTHROPIC_API_KEY="your-anthropic-key"
```

### Model Configuration

Default models can be overridden in `prompts/config/prompt-config.yml`:

```yaml
system:
  default_model: "gpt-4o"
  
models:
  openai:
    gpt-4o:
      temperature: 0.3
      max_tokens: 4000
```

## 📝 Creating New Prompts

### Using the CLI

```bash
npm run prompts -- init my-analysis-prompt --category=analysis
```

### Manual Creation

1. Create a file in the appropriate category: `prompts/catalog/<category>/<name>.yml`
2. Follow the standard format (see existing prompts)
3. Validate: `npm run prompts:validate`
4. Test: `npm run prompts:test <category>/<name>`

### Prompt Format

```yaml
filename: my-prompt
description: What this prompt does
version: "1.0.0"
category: analysis
tags: [analysis, security]

model: gpt-4o
modelParameters:
  temperature: 0.3
  max_tokens: 2000

variables:
  input_data:
    type: string
    description: Data to analyze
    required: true

messages:
  - role: system
    content: System instructions
  - role: user
    content: User prompt with {{variables}}

testData:
  - variables:
      input_data: "test data"
    expected: "Expected output pattern"

evaluators:
  - name: Check quality
    string:
      contains: "analysis"
```

## 🔄 Migration from Legacy Formats

### Automatic Migration

```bash
npm run prompts -- migrate .github/workflows/prompts/
```

### Manual Migration

1. Copy existing prompt content
2. Adapt to new format using schema
3. Add required metadata fields
4. Validate and test

## 🧪 Testing & Validation

### Validation

```bash
# Validate all prompts
npm run prompts:validate

# Validate specific prompt
npm run prompts:validate prompts/catalog/coding-agent/code-review.yml

# Get JSON output
npm run prompts:validate --json
```

### Testing

```bash
# Test with built-in test data
npm run prompts:test coding-agent/code-review-analysis

# Test specific case
npm run prompts:test coding-agent/code-review-analysis --case=1
```

## 🌐 API Server

Start the REST API server:

```bash
npm run prompts:server
# or
npm run prompts -- server 3002
```

### API Endpoints

- `GET /api/prompts` - List available prompts
- `POST /api/prompts/execute` - Execute a prompt
- `POST /api/prompts/test` - Test a prompt
- `GET /health` - Health check

### Example API Usage

```bash
# List prompts
curl http://localhost:3002/api/prompts

# Execute prompt
curl -X POST http://localhost:3002/api/prompts/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "coding-agent/code-review-analysis",
    "variables": {
      "project_readme": "My project description"
    }
  }'
```

## 🔗 Integration Examples

### Pull Request Analysis

Automatically triggered on PRs to analyze code changes:

```yaml
- name: AI Code Analysis
  if: github.event_name == 'pull_request'
  uses: ./.github/workflows/prompt-orchestrator.yml
  with:
    prompt_name: 'coding-agent/code-review-analysis'
    variables: |
      {
        "project_readme": "${{ steps.readme.outputs.content }}",
        "code_files": "${{ steps.changes.outputs.files }}"
      }
```

### Workflow Optimization

Analyze and optimize CI/CD workflows:

```yaml
- name: Optimize Workflow
  uses: ./.github/workflows/prompt-orchestrator.yml
  with:
    prompt_name: 'workflow/workflow-optimizer'
    variables: |
      {
        "currentWorkflow": "${{ steps.workflow.outputs.content }}",
        "projectType": "Node.js Music Platform"
      }
```

## 📊 Monitoring & Analytics

### Execution Metrics

The system tracks:
- Execution time
- Success/failure rates
- Token usage
- Model performance

### Logging

Logs are written to:
- Console output (development)
- `prompts.log` (production)
- GitHub Actions logs (workflows)

## 🔒 Security Considerations

### API Keys
- Store API keys as GitHub Secrets
- Never commit keys to repository
- Use environment variables

### Input Validation
- All inputs are validated against schema
- Variable substitution is safe
- No code execution in prompts

### Rate Limiting
- Built-in rate limiting (60 requests/minute)
- Configurable limits per provider
- Automatic fallback mechanisms

## 🚀 Performance Optimization

### Caching
- Results cached for 1 hour by default
- Configurable TTL
- Memory-based caching

### Parallel Execution
- Multiple prompts can run concurrently
- Configurable concurrency limits
- Smart scheduling

## 🔮 Future Enhancements

### Planned Features
- [ ] Visual prompt builder
- [ ] Advanced analytics dashboard
- [ ] Prompt versioning and rollback
- [ ] A/B testing framework
- [ ] Custom evaluator functions
- [ ] Multi-language support
- [ ] Prompt composition and chaining

### Integration Roadmap
- [ ] VS Code extension
- [ ] Slack bot integration
- [ ] Email automation
- [ ] Database query generation
- [ ] Code generation workflows

## 💡 Best Practices

### Prompt Design
1. **Clear Instructions**: Be specific about desired output
2. **Variable Usage**: Use meaningful variable names
3. **Test Data**: Include comprehensive test cases
4. **Validation**: Add evaluators for quality control
5. **Documentation**: Write clear descriptions

### Workflow Integration
1. **Error Handling**: Always handle prompt failures
2. **Rate Limits**: Respect API limitations
3. **Caching**: Use caching for repeated operations
4. **Monitoring**: Track usage and performance
5. **Security**: Protect sensitive data

### Development Workflow
1. **Local Testing**: Test prompts locally before committing
2. **Validation**: Run validation on all changes
3. **Version Control**: Track prompt changes with git
4. **Documentation**: Update docs when adding prompts
5. **Review**: Peer review prompt changes

## 🆘 Troubleshooting

### Common Issues

**Validation Errors**
- Check YAML syntax
- Verify required fields
- Review schema compliance

**Execution Failures**
- Verify API keys are set
- Check rate limits
- Review variable substitution

**Performance Issues**
- Enable caching
- Optimize prompt size
- Use appropriate models

### Getting Help

1. Check the validation output for specific errors
2. Review the prompt schema documentation
3. Test with minimal examples
4. Check GitHub Actions logs for detailed error messages

## 📚 Additional Resources

- [Prompt Schema Reference](./schema/prompt-schema.json)
- [Configuration Guide](./config/prompt-config.yml)
- [Example Prompts](./catalog/)
- [GitHub Actions Integration](./.github/workflows/prompt-orchestrator.yml)

---

*This prompt system was designed to unify and optimize AI-powered automation across the EchoTune AI platform, enabling consistent, reliable, and interchangeable prompt execution.*