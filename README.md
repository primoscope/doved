# 🎵 EchoTune AI - Modern Music Discovery Platform

<div align="center">

[![CI/CD Pipeline](https://github.com/primoscope/doved/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/primoscope/doved/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Python Version](https://img.shields.io/badge/python-%3E%3D3.8-blue)](https://python.org/)

**Next-generation AI-powered music recommendation system with conversational interface**

[🚀 Quick Start](#-quick-start) • [📖 Documentation](#-documentation) • [🔧 Development](#-development) • [🐳 Docker](#-docker-deployment) • [☁️ Cloud Deploy](#️-cloud-deployment)

</div>

---

## ⚡ Quick Start

Get EchoTune AI running in under 3 minutes with our modern installation script:

```bash
# 🎯 One-command installation (recommended)
./install-modern.sh

# 🚀 Alternative: Quick setup for development
git clone https://github.com/primoscope/doved.git
cd doved
npm run install:modern

# 🔄 Start the application
npm start

# 🌐 Open http://localhost:3000
```

**✨ Demo mode works without API keys!** Perfect for testing and development.

### Installation Options

```bash
# Development setup with all features
./install-modern.sh

# Quick minimal setup (fastest)
./install-modern.sh --quick

# Production deployment
./install-modern.sh --production

# Docker container setup
./install-modern.sh --docker

# Custom port
./install-modern.sh --port 8080
```

---

## 🌟 Features

### 🎵 **Intelligent Music Discovery**
- **AI-Powered Recommendations**: Context-aware suggestions using advanced ML
- **Conversational Interface**: Natural language music requests
- **Multi-Provider LLM Support**: OpenAI, Google Gemini, Azure, with smart fallbacks
- **Real-time Chat**: Socket.IO integration for instant responses

### 🎨 **Modern User Experience**  
- **Responsive Design**: Mobile-first, glassmorphism UI
- **Voice Interface**: Hands-free music discovery
- **Real-time Analytics**: Listening pattern insights
- **Smart Playlists**: AI-generated playlists from conversations

### 🤖 **Advanced Automation**
- **MCP Server Integration**: Browser automation for Spotify
- **Auto-deployment**: One-click cloud deployment
- **Health Monitoring**: Comprehensive system diagnostics
- **Smart Workflows**: Automated development and testing

---

## 🔧 Development

### Modern Developer Experience

```bash
# 🏃‍♂️ Development server with hot reload
npm run dev

# 🧪 Run tests
npm test
npm run test:coverage

# 🔍 Code quality
npm run lint
npm run format

# 🏥 Health check
npm run health:full

# 🔧 MCP servers
npm run mcp:install
npm run mcp:health
```

### Project Structure

```
echotune-ai/
├── src/                    # Frontend components & backend logic
├── scripts/               # Automation & deployment scripts  
├── mcp-servers/           # Model Context Protocol servers
├── tests/                 # Comprehensive test suite
├── docs/                  # Documentation
├── .github/workflows/     # Modern CI/CD pipeline
└── install-modern.sh      # One-click installation
```

### Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit with your credentials (all optional for demo mode)
nano .env
```

**Required for full functionality:**
- `SPOTIFY_CLIENT_ID` & `SPOTIFY_CLIENT_SECRET` - Spotify API access
- `OPENAI_API_KEY` or `GEMINI_API_KEY` - AI chat (falls back to demo mode)
- `MONGODB_URI` - Database (falls back to SQLite)

---

## 🐳 Docker Deployment

### Quick Docker Setup

```bash
# Build and run with Docker
docker build -t echotune-ai .
docker run -d -p 3000:3000 --name echotune-ai echotune-ai

# Or use Docker Compose
docker-compose up -d

# Health check
curl http://localhost:3000/health
```

### Production Docker

```bash
# Production build with optimizations
docker build -f Dockerfile.prod -t echotune-ai:prod .

# Run with environment variables
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e SPOTIFY_CLIENT_ID=your_id \
  -e SPOTIFY_CLIENT_SECRET=your_secret \
  --name echotune-ai-prod \
  echotune-ai:prod
```

---

## ☁️ Cloud Deployment

### DigitalOcean App Platform (Recommended)

[![Deploy to DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/primoscope/doved)

### Manual Cloud Deployment

```bash
# Ubuntu/Debian server setup
curl -fsSL https://raw.githubusercontent.com/primoscope/doved/main/install-modern.sh | bash -s -- --production

# Or download and run
wget https://raw.githubusercontent.com/primoscope/doved/main/install-modern.sh
chmod +x install-modern.sh
./install-modern.sh --production
```

### Deploy Commands

```bash
# Deploy to production
npm run deploy

# Deploy with DigitalOcean optimizations  
npm run deploy:digitalocean

# Validate deployment
npm run validate-deployment

# Health monitoring
npm run health:full
```

---

## 🧪 Testing & Quality

### Comprehensive Testing Suite

```bash
# Run all tests
npm test

# Specific test suites
npm run test:unit              # Unit tests
npm run test:integration       # Integration tests
npm run test:e2e              # End-to-end tests
npm run test:coverage         # Coverage report

# MCP server tests
npm run mcp:test

# Security audit
npm run security:audit
```

### Code Quality Tools

```bash
# Linting and formatting
npm run lint                  # ESLint checks
npm run lint:fix             # Auto-fix issues
npm run format               # Prettier formatting

# Health diagnostics
npm run health:full          # Complete system check
npm run env:validate         # Environment validation
```

---

## 📚 Documentation

### Quick Reference

- **[Installation Guide](./docs/installation.md)** - Detailed setup instructions
- **[API Documentation](./docs/api.md)** - REST API reference
- **[Environment Setup](./docs/environment.md)** - Configuration guide
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues & solutions
- **[Contributing](./docs/contributing.md)** - Development guidelines

### Advanced Guides

- **[MCP Server Integration](./docs/mcp-integration.md)** - Automation server setup
- **[Database Architecture](./DATABASE_ARCHITECTURE_GUIDE.md)** - Data design
- **[Deployment Guide](./docs/deployment.md)** - Production deployment
- **[Security Best Practices](./docs/security.md)** - Security guidelines

---

## 🚀 Tech Stack

**Frontend:** React, Socket.IO, Modern CSS with Glassmorphism  
**Backend:** Node.js, Express, WebSocket  
**AI/ML:** OpenAI GPT, Google Gemini, Custom Models  
**Database:** MongoDB, SQLite fallback, Supabase  
**Automation:** MCP Servers, Puppeteer, Browser Automation  
**Deployment:** Docker, DigitalOcean, Nginx, SSL/TLS  
**Testing:** Jest, Playwright, Comprehensive Test Suite  

---

## 🔒 Security & Privacy

- **🔐 OAuth 2.0** secure Spotify authentication
- **🛡️ Rate limiting** and DDoS protection
- **🔒 SSL/TLS** encryption for all communications
- **🚫 No API keys in code** - environment-based configuration
- **📝 Comprehensive logging** for security monitoring
- **🔍 Regular security audits** via automated testing

---

## 🤝 Contributing

We welcome contributions! EchoTune AI is designed for collaborative development.

```bash
# Development setup
git clone https://github.com/primoscope/doved.git
cd doved
npm run install:modern

# Create feature branch
git checkout -b feature/amazing-feature

# Run tests and linting
npm test && npm run lint

# Submit pull request
```

**Contributing Guidelines:**
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all CI checks pass

---

## 📊 Project Status

**✅ Production Ready** - Core functionality tested and validated  
**🚀 Active Development** - Regular updates and new features  
**🤖 AI-Enhanced** - Cutting-edge ML and automation integration  
**🌐 Cloud Optimized** - Designed for scalable cloud deployment  

### Recent Updates

- ✅ **Modern CI/CD Pipeline** - Streamlined testing and deployment
- ✅ **One-Click Installation** - Simplified setup process
- ✅ **Enhanced Health Monitoring** - Comprehensive system diagnostics
- ✅ **Improved Code Quality** - ESLint fixes and modern standards
- ✅ **Optimized Workflows** - Better developer experience

---

## 📄 License

Released under the [MIT License](LICENSE). Feel free to use, modify, and distribute.

---

## 🙏 Acknowledgments

- **Spotify Web API** for music data access
- **OpenAI & Google** for AI/ML capabilities  
- **Open Source Community** for amazing tools and libraries
- **Contributors** who make this project possible

---

<div align="center">

**🎵 Ready to discover your next favorite song? [Get started now!](#-quick-start)**

[![GitHub stars](https://img.shields.io/github/stars/primoscope/doved?style=social)](https://github.com/primoscope/doved/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/primoscope/doved?style=social)](https://github.com/primoscope/doved/network)

</div>