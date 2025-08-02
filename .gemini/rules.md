# Gemini Code Assist Rules for EchoTune AI

## Code Style Rules

### JavaScript/TypeScript
- Use modern ES6+ features (async/await, destructuring, arrow functions)
- Prefer const/let over var
- Use meaningful variable names (trackId, not id)
- Include JSDoc comments for public methods
- Handle errors with try/catch blocks
- Use environment variables for configuration

### Python
- Follow PEP 8 style guidelines
- Use type hints for function parameters and return values
- Include docstrings for classes and methods
- Use meaningful variable names (user_preferences, not prefs)
- Handle exceptions appropriately
- Use virtual environments and requirements.txt

### Database Queries
- Use parameterized queries to prevent injection
- Index frequently queried fields
- Limit result sets appropriately
- Use aggregation pipelines for complex operations
- Handle connection errors gracefully

## Security Rules

### API Keys and Secrets
- Never hardcode API keys in source code
- Use environment variables for sensitive configuration
- Rotate keys regularly
- Use different keys for development and production
- Log security events appropriately

### Input Validation
- Validate all user inputs
- Sanitize data before database operations
- Use allowlists for expected values
- Validate file uploads carefully
- Check user permissions before operations

### Authentication
- Use secure session management
- Implement proper logout functionality
- Use HTTPS for all authentication flows
- Validate tokens on each request
- Implement rate limiting for auth endpoints

## Performance Rules

### Database Operations
- Use connection pooling
- Index queries appropriately
- Avoid N+1 query problems
- Use bulk operations for multiple records
- Monitor query performance

### API Usage
- Implement caching where appropriate
- Respect rate limits
- Use compression for large responses
- Implement pagination for list endpoints
- Monitor API usage metrics

### Memory Management
- Clean up resources properly
- Use streams for large data processing
- Avoid memory leaks with proper cleanup
- Monitor memory usage in production
- Use efficient data structures

## Music Domain Rules

### Audio Features
- Validate audio feature ranges (0-1 for most features)
- Handle missing audio features gracefully
- Use appropriate defaults for missing data
- Consider feature normalization for ML models
- Document feature meanings clearly

### Recommendation Logic
- Implement fallback strategies for cold start problems
- Use multiple recommendation strategies
- Consider user context (time, mood, activity)
- Implement diversity in recommendations
- Track recommendation effectiveness

### Spotify API Integration
- Handle API rate limits (429 responses)
- Implement token refresh logic
- Validate API responses
- Handle API downtime gracefully
- Cache frequently accessed data

## Testing Rules

### Unit Tests
- Test happy path and error cases
- Mock external dependencies
- Use descriptive test names
- Test edge cases and boundary conditions
- Maintain good test coverage

### Integration Tests
- Test API endpoints end-to-end
- Test database operations
- Test external API integrations
- Use test data that mirrors production
- Clean up test data after tests

### Performance Tests
- Test with realistic data volumes
- Monitor response times
- Test concurrent user scenarios
- Monitor resource usage during tests
- Test scalability limits

## Documentation Rules

### Code Documentation
- Include JSDoc/docstring for public methods
- Document complex algorithms
- Explain business logic clearly
- Include usage examples
- Keep documentation up to date

### API Documentation
- Document all endpoints clearly
- Include request/response examples
- Document error codes and messages
- Include authentication requirements
- Provide SDK examples

### Configuration Documentation
- Document all environment variables
- Include setup instructions
- Document deployment procedures
- Include troubleshooting guides
- Maintain changelog