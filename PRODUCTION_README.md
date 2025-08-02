# 🎵 EchoTune AI - Production Ready Setup

[![Production Status](https://img.shields.io/badge/Production-Ready-green)]()
[![Docker](https://img.shields.io/badge/Docker-Enabled-blue)]()
[![SSL](https://img.shields.io/badge/SSL-Configured-green)]()
[![Security](https://img.shields.io/badge/Security-Hardened-red)]()

A production-ready music recommendation chatbot with Spotify integration, designed for deployment on **primosphere.studio**.

![EchoTune AI Interface](https://github.com/user-attachments/assets/e0bff6ff-df46-420a-b2f3-e5d86e9df40f)

## 🚀 Quick Deploy to Digital Ocean

```bash
# 1. Create Ubuntu 22.04 droplet on Digital Ocean
# 2. SSH into your droplet
ssh root@YOUR_DROPLET_IP

# 3. Run the automated setup
curl -fsSL https://raw.githubusercontent.com/dzp5103/Spotify-echo/main/scripts/setup-digitalocean.sh | bash

# 4. Configure your environment
cd /opt/echotune
cp .env.production.example .env
nano .env  # Add your Spotify credentials

# 5. Setup SSL certificates
sudo certbot --nginx -d primosphere.studio -d www.primosphere.studio

# 6. Deploy the application
./scripts/deploy.sh

# 7. Harden security (optional but recommended)
./scripts/security-hardening.sh
```

## ✨ Features

- 🎤 **AI-Powered Chat Interface** - Natural language music requests
- 🔗 **Spotify OAuth Integration** - Secure user authentication
- 🎵 **Real-time Recommendations** - Personalized music suggestions
- 📱 **Responsive Design** - Works on desktop and mobile
- 🔒 **Production Security** - SSL, rate limiting, monitoring
- 🐳 **Docker Deployment** - Containerized for easy scaling
- 📊 **Health Monitoring** - Automated health checks and recovery
- 🌐 **Reverse Proxy** - Nginx with SSL termination

## 🏗️ Architecture

```
Internet → Cloudflare/DNS → Digital Ocean Droplet
                                    ↓
                               Nginx (SSL/Proxy)
                                    ↓
                            Docker Container (Node.js)
                                    ↓
                              Spotify API
```

## 📋 Prerequisites

- **Digital Ocean Account** - For hosting
- **Domain Control** - `primosphere.studio` DNS access
- **Spotify Developer App** - Client ID and Secret
- **Basic Terminal Skills** - SSH and command line

## 🔧 Production Configuration

### Environment Variables

Key variables for production (see `.env.production.example`):

```env
# Required
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://primosphere.studio/auth/callback

# Production
NODE_ENV=production
FRONTEND_URL=https://primosphere.studio
```

### SSL Certificates

Automatically configured with Let's Encrypt:

```bash
sudo certbot --nginx -d primosphere.studio -d www.primosphere.studio
```

### Security Features

- ✅ **Firewall configured** (UFW)
- ✅ **Fail2ban protection** against brute force
- ✅ **Rate limiting** on API endpoints
- ✅ **Security headers** in nginx
- ✅ **Auto security updates**
- ✅ **SSH hardening**

## 📊 Monitoring

### Health Checks

- Application: `https://primosphere.studio/health`
- Monitoring service: `systemctl status echotune-monitor`

### Logs

```bash
# Application logs
docker-compose logs -f app

# Nginx logs
tail -f /var/log/nginx/echotune_access.log

# System monitoring
htop
```

## 🚀 Deployment Commands

```bash
# Deploy/update application
./scripts/deploy.sh

# Check application health
curl https://primosphere.studio/health

# View application status
docker-compose ps

# Restart services
docker-compose restart

# View logs
docker-compose logs -f

# Test Spotify authentication
node scripts/test-spotify-auth.js
```

## 🔍 Troubleshooting

### Common Issues

**Spotify Authentication Fails**
```bash
# Check credentials
node scripts/test-spotify-auth.js

# Verify redirect URI in Spotify app settings
# Must exactly match: https://primosphere.studio/auth/callback
```

**SSL Certificate Issues**
```bash
# Check certificate status
sudo certbot certificates

# Renew certificates
sudo certbot renew --force-renewal
```

**Application Won't Start**
```bash
# Check logs
docker-compose logs app

# Check environment
docker-compose exec app env | grep SPOTIFY

# Restart everything
docker-compose down && docker-compose up -d
```

## 📈 Performance Optimization

### Recommended Droplet Sizes

- **Development**: Basic - $6/month (1 GB RAM)
- **Production**: Standard - $12/month (2 GB RAM)
- **High Traffic**: CPU-Optimized - $24/month (4 GB RAM)

### Scaling Options

- **Horizontal Scaling**: Load balancer + multiple droplets
- **Database Scaling**: External MongoDB/PostgreSQL
- **CDN**: Cloudflare for static assets
- **Caching**: Redis for session storage

## 🔐 Security Best Practices

### Production Checklist

- ✅ SSL certificates configured
- ✅ Firewall enabled (ports 22, 80, 443 only)
- ✅ Fail2ban configured
- ✅ SSH key authentication only
- ✅ Regular security updates
- ✅ Strong passwords/secrets
- ✅ Rate limiting enabled
- ✅ Security headers configured

### Ongoing Maintenance

```bash
# Monthly security updates
sudo apt update && sudo apt upgrade -y

# Check fail2ban status
sudo fail2ban-client status

# Monitor resource usage
htop
df -h

# Check SSL certificate expiry
sudo certbot certificates
```

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install
pip install -r requirements.txt

# Start development server
npm run dev

# Test authentication
node scripts/test-spotify-auth.js
```

### Testing

```bash
# Run tests
npm test

# Lint code
npm run lint

# Health check
npm run health-check
```

## 📚 Documentation

- [Digital Ocean Deployment Guide](./DIGITALOCEAN_DEPLOYMENT.md)
- [Database Architecture](./DATABASE_ARCHITECTURE_GUIDE.md)
- [Data Management](./DATA_MANAGEMENT.md)
- [MongoDB Setup](./MONGODB_SETUP.md)

## 🆘 Support

### Getting Help

1. **Check logs first**: `docker-compose logs app`
2. **Review deployment guide**: [DIGITALOCEAN_DEPLOYMENT.md](./DIGITALOCEAN_DEPLOYMENT.md)
3. **Test authentication**: `node scripts/test-spotify-auth.js`
4. **Check GitHub issues**: Repository issues page

### Monitoring Endpoints

- **Health**: `https://primosphere.studio/health`
- **Status**: `systemctl status echotune`
- **Monitoring**: `systemctl status echotune-monitor`

## 📜 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

🎉 **Ready to rock!** Your music assistant is now live at `https://primosphere.studio`