# EchoTune AI Prompt Library

This directory contains the unified prompt management system for EchoTune AI. All prompts are standardized and can be used interchangeably across different workflows and automation systems.

## Directory Structure

```
prompts/
├── README.md                    # This file
├── schema/                      # Prompt validation schemas
│   └── prompt-schema.json      # JSON schema for prompt validation
├── catalog/                     # Main prompt catalog
│   ├── coding-agent/           # Coding and development prompts
│   ├── analysis/               # Code analysis and review prompts
│   ├── automation/             # Workflow automation prompts
│   ├── documentation/          # Documentation generation prompts
│   └── workflow/               # CI/CD workflow prompts
├── config/                      # Configuration files
│   └── prompt-config.yml       # Global prompt configuration
└── tools/                       # Prompt management tools
    ├── validator.js            # Prompt validation utility
    ├── executor.js             # Prompt execution utility
    └── cli.js                  # Command-line interface
```

## Prompt Format

All prompts follow the standardized YAML format:

```yaml
# Prompt Metadata
filename: example-prompt
description: Brief description of what this prompt does
version: "1.0.0"
category: coding-agent
tags: [development, code-review, automation]

# Model Configuration
model: gpt-4o
modelParameters:
  temperature: 0.3
  max_tokens: 2000
  top_p: 0.9

# Prompt Content
messages:
  - role: system
    content: |
      System message with context and instructions
  - role: user
    content: |
      User message template with variables like {{variable}}

# Test Data (optional)
testData:
  - variable: example_value
    expected: Expected response pattern

# Validation Rules (optional)
evaluators:
  - name: Check for specific content
    string:
      contains: "expected_string"
```

## Usage

### GitHub Actions

Use the prompt orchestration workflow:

```yaml
uses: ./.github/workflows/prompt-orchestrator.yml
with:
  prompt_name: coding-agent/code-review
  variables: |
    code_file: src/example.js
    review_type: security
```

### CLI Usage

```bash
# Validate all prompts
npm run prompts:validate

# Execute a specific prompt
npm run prompts:execute coding-agent/code-review --file=src/example.js

# List available prompts
npm run prompts:list

# Test a prompt
npm run prompts:test coding-agent/code-review
```

### Programmatic Usage

```javascript
const { PromptManager } = require('./prompts/tools/executor');

const manager = new PromptManager();
const result = await manager.execute('coding-agent/code-review', {
  code_file: 'src/example.js',
  review_type: 'security'
});
```

## Integration with Existing Workflows

The prompt system integrates seamlessly with existing GitHub Actions workflows:

1. **Legacy Support**: Existing workflows continue to work unchanged
2. **Gradual Migration**: Workflows can be migrated to use the new prompt system incrementally
3. **Interoperability**: New prompt format is compatible with existing automation tools

## Best Practices

1. **Naming Convention**: Use descriptive names with category prefixes
2. **Versioning**: Update version numbers when making breaking changes
3. **Documentation**: Include clear descriptions and examples
4. **Testing**: Add test data and validation rules
5. **Modularity**: Keep prompts focused on specific tasks
6. **Variables**: Use parameterization for reusability

## Contributing

When adding new prompts:

1. Follow the standard format and schema
2. Add appropriate metadata and tags
3. Include test data and evaluators
4. Update the prompt catalog
5. Run validation tests before committing