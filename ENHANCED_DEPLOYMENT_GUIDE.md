# EchoTune AI - Enhanced Deployment Guide

## Quick Deployment Options

### 1. Standard Production Deployment
```bash
npm run deploy
# Full production deployment with all features
```

### 2. Simplified Deployment
```bash
npm run deploy:simple
# Quick deployment for development/testing
```

### 3. DigitalOcean Quick Deploy
```bash
npm run deploy:digitalocean
# Optimized for DigitalOcean droplets
```

## New Features

### Enhanced Health Monitoring
- `/health` - Comprehensive system health
- `/health/:component` - Individual component checks
- `/ready` - Readiness probe for load balancers
- `/alive` - Simple liveness check

### Security Enhancements
- Rate limiting on all endpoints
- Comprehensive input sanitization
- Security headers (CSP, HSTS, etc.)
- CORS protection

### Error Handling
- Comprehensive error middleware
- Request logging and monitoring
- Graceful error recovery

### Testing Suite
- Integration tests for deployment
- Unit tests for health checks
- E2E tests for user flows
- Performance testing

## Management Commands

```bash
# Deployment
npm run deploy:simple          # Quick deployment
npm run deploy:digitalocean    # DigitalOcean optimized
npm run deploy                 # Full production deployment

# Integration
./scripts/integrate-mcp.sh     # MCP server integration

# Testing
npm test                       # Run all tests
npm run test:integration       # Integration tests only
npm run test:e2e              # End-to-end tests

# Health Monitoring
curl http://localhost:3000/health          # Full health check
curl http://localhost:3000/health/database # Database health only
curl http://localhost:3000/ready           # Readiness check
curl http://localhost:3000/alive           # Liveness check
```

## Troubleshooting

### Common Issues
1. **Port conflicts**: Check if ports 3000, 3001 are available
2. **Docker issues**: Restart Docker service
3. **Permission issues**: Ensure proper file permissions
4. **Environment variables**: Verify .env file configuration

### Debugging
```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Health diagnostics
curl -s http://localhost:3000/health | jq

# System resources
docker stats
```
