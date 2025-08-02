# 🎵 EchoTune AI - Digital Ocean Deployment Guide

This comprehensive guide will help you deploy EchoTune AI to a Digital Ocean droplet with professional-grade security, monitoring, and scalability.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup) 
3. [Domain Configuration](#domain-configuration)
4. [Application Deployment](#application-deployment)
5. [SSL Configuration](#ssl-configuration)
6. [Security Hardening](#security-hardening)
7. [Monitoring Setup](#monitoring-setup)
8. [Backup Configuration](#backup-configuration)
9. [Maintenance Procedures](#maintenance-procedures)
10. [Troubleshooting](#troubleshooting)
11. [Performance Optimization](#performance-optimization)
12. [Scaling Considerations](#scaling-considerations)

## Prerequisites

### Digital Ocean Account Setup
- Digital Ocean account with payment method
- SSH key configured for secure access
- Domain name pointing to your droplet

### Spotify Developer Setup
- Spotify Developer account
- Created Spotify application with proper redirect URIs
- Client ID and Client Secret ready

### Required Information
- Domain name (e.g., `primosphere.studio`)
- Spotify Client ID and Secret
- Email for SSL certificates and alerts
- SSH key for server access

## Server Setup

### Step 1: Create Digital Ocean Droplet

**Recommended Specifications:**

| Environment | Plan | Specs | Cost |
|-------------|------|-------|------|
| Development | Basic | 1 CPU, 2GB RAM, 50GB SSD | $12/month |
| Production | Standard | 2 CPU, 4GB RAM, 80GB SSD | $24/month |
| High Traffic | CPU-Optimized | 4 CPU, 8GB RAM, 160GB SSD | $48/month |

**Setup Instructions:**
1. Create new Droplet in Digital Ocean dashboard
2. Choose **Ubuntu 22.04 LTS** as the image
3. Select appropriate plan based on expected traffic
4. Choose datacenter region closest to your users
5. Add your SSH key for authentication
6. Set hostname to `echotune-production`
7. Enable monitoring and backups (recommended)

### Step 2: Initial Server Access

```bash
# Connect to your droplet (replace with your IP)
ssh root@YOUR_DROPLET_IP

# Create application user (if connecting as root)
adduser echotune
usermod -aG sudo echotune
su - echotune
```

### Step 3: Enhanced Automated Setup

The setup script now provides **intelligent environment detection and configuration**:

```bash
# Download and run the comprehensive setup script
curl -fsSL https://raw.githubusercontent.com/dzp5103/Spotify-echo/main/scripts/setup-digitalocean.sh -o setup.sh
chmod +x setup.sh
./setup.sh
```

**What the enhanced setup script does:**
- ✅ **Auto-detects existing .env files** from previous installations
- ✅ **Preserves existing configuration** while updating for production
- ✅ **Validates system requirements** with recommendations
- ✅ **Installs all dependencies** (Docker, Node.js, Python, nginx, Redis)
- ✅ **Creates secure application structure** with proper permissions
- ✅ **Configures production optimizations** automatically
- ✅ **Prepares SSL certificate setup** with automation
- ✅ **Applies security hardening** and firewall configuration

**Intelligent Environment Handling:**
- If `.env` exists: Uses existing configuration and updates for production
- If no `.env`: Creates from template with production defaults
- Automatically updates localhost URLs to production domains
- Preserves custom database configurations and API keys
- Validates configuration format and provides warnings

The enhanced setup script will:
- ✅ Check system requirements and recommendations
- ✅ Install and configure Docker, Docker Compose, Node.js, Python
- ✅ Install nginx, Redis, and monitoring tools
- ✅ Create application user and directory structure
- ✅ Clone the repository and install dependencies
- ✅ **Detect and configure environment automatically**
- ✅ Configure system optimizations for production
- ✅ Prepare SSL certificate setup
- ✅ Configure firewall and security tools

## Domain Configuration

### Step 1: DNS Configuration

Configure your domain's DNS records:

```
Type    Name                    Value               TTL
A       @                       YOUR_DROPLET_IP     300
A       www                     YOUR_DROPLET_IP     300
CNAME   api                     @                   300
```

### Step 2: Verify DNS Propagation

```bash
# Check DNS propagation
dig primosphere.studio
dig www.primosphere.studio

# Verify from multiple locations
nslookup primosphere.studio 8.8.8.8
```

## Application Deployment

### Step 1: Environment Configuration (Automated)

The deployment process now **automatically detects and uses existing .env files**. The scripts will search for .env files in the following order:

1. Current directory (`./.env`)
2. Application directory (`/opt/echotune/.env`)
3. Working directory (`$(pwd)/.env`)

**Automated Environment Detection:**
```bash
# The deployment scripts automatically:
# ✅ Detect existing .env files
# ✅ Validate required environment variables
# ✅ Use existing values where possible
# ✅ Apply production defaults automatically
# ✅ Provide clear error messages for missing variables
```

**If you already have a .env file configured**, simply run:
```bash
cd /opt/echotune
./scripts/deploy.sh
```

**If you need to create a new .env file**, the setup script will guide you:
```bash
cd /opt/echotune
sudo nano .env
```

**Required Configuration (automatically validated):**
```env
# Spotify API (REQUIRED)
SPOTIFY_CLIENT_ID=your_actual_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_actual_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://primosphere.studio/auth/callback

# Production Settings (auto-configured for production)
NODE_ENV=production
PORT=3000
DOMAIN=primosphere.studio
FRONTEND_URL=https://primosphere.studio

# Security (REQUIRED for production)
SESSION_SECRET=generate_secure_32_char_random_string
JWT_SECRET=generate_secure_32_char_random_string

# Monitoring
ALERT_EMAIL=admin@primosphere.studio
LETSENCRYPT_EMAIL=admin@primosphere.studio
```

**Automatic Production Updates:**
The deployment scripts will automatically update development settings to production values:
- `NODE_ENV` → `production`
- `FRONTEND_URL` → `https://your-domain.com`
- `SPOTIFY_REDIRECT_URI` → `https://your-domain.com/auth/callback`

**Generate Secure Secrets:**
```bash
# Generate secure session secret
openssl rand -hex 32

# Generate JWT secret
openssl rand -base64 32
```

### Step 2: Automated Database Configuration

The deployment script automatically **detects and validates database connections** from your .env file:

**MongoDB Atlas (automatically tested):**
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/echotune_prod
MONGODB_DATABASE=echotune_production
```

**Redis Configuration (automatically tested):**
```env
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password
```

**Digital Ocean Databases (automatically detected):**
```env
DO_DATABASE_URL=postgresql://username:password@db-cluster.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

### Step 3: One-Command Deployment

The enhanced deployment script now provides **fully automated deployment**:

```bash
cd /opt/echotune
./scripts/deploy.sh
```

**What the automated deployment does:**
- ✅ **Auto-detects .env files** from multiple locations
- ✅ **Validates all environment variables** with clear error messages
- ✅ **Tests database connections** before deployment
- ✅ **Creates backups** before deploying new version
- ✅ **Sets up SSL certificates** automatically using Let's Encrypt
- ✅ **Builds and starts services** with health checks
- ✅ **Configures monitoring** and alerting
- ✅ **Generates deployment reports** with system status
- ✅ **Validates application health** before completion

**Example output:**
```bash
🚀 EchoTune AI - Enhanced Production Deployment
==============================================

[INFO] Detecting and sourcing environment configuration...
[INFO] Found environment file: /opt/echotune/.env
[SUCCESS] Environment variables loaded from /opt/echotune/.env
[INFO] Validating environment configuration...
[SUCCESS] Environment validation passed
[INFO] Testing MongoDB connection...
[SUCCESS] MongoDB connection verified
[INFO] Creating backup of current deployment...
[SUCCESS] Backup created at /opt/echotune/backups/backup_20240101_120000
[INFO] Building application...
[SUCCESS] Application built successfully
[INFO] Deploying application...
[SUCCESS] Services started
[INFO] Waiting for application to be healthy...
[SUCCESS] Application is healthy!
🎉 Deployment completed successfully!
```

## SSL Configuration

### Automatic SSL Setup (Recommended)

The deployment script automatically configures SSL certificates using Let's Encrypt:

```bash
# SSL is configured automatically during deployment
# Manual setup if needed:
cd /opt/echotune
./setup-ssl.sh
```

### Manual SSL Configuration

```bash
# Generate certificates manually
sudo certbot --nginx -d primosphere.studio -d www.primosphere.studio

# Copy certificates to application directory
sudo cp /etc/letsencrypt/live/primosphere.studio/fullchain.pem /opt/echotune/ssl/primosphere.studio.crt
sudo cp /etc/letsencrypt/live/primosphere.studio/privkey.pem /opt/echotune/ssl/primosphere.studio.key
sudo chown echotune:echotune /opt/echotune/ssl/*
```

### SSL Certificate Monitoring

The system automatically monitors SSL certificate expiry and sends alerts when certificates need renewal.

## Security Hardening

### Step 1: Run Security Hardening Script

```bash
cd /opt/echotune
./scripts/security-hardening.sh
```

This configures:
- ✅ UFW firewall with required ports only
- ✅ Fail2ban for intrusion detection
- ✅ Automatic security updates
- ✅ SSH hardening
- ✅ Log rotation and monitoring
- ✅ System optimization

### Step 2: Security Verification

```bash
# Check firewall status
sudo ufw status verbose

# Check fail2ban status
sudo fail2ban-client status

# Verify SSH configuration
sudo sshd -T | grep -E '(PermitRootLogin|PasswordAuthentication)'

# Check for security updates
sudo unattended-upgrade --dry-run
```

### Step 3: Additional Security Measures

**Network Security:**
```bash
# Only allow necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw deny 3000/tcp  # Block direct app access
```

**Application Security:**
- Rate limiting configured per endpoint
- Input sanitization and validation
- CORS restricted to production domains
- Security headers (CSP, HSTS, etc.)
- Session security with httpOnly cookies

## Monitoring Setup

### Step 1: Comprehensive Monitoring

The system includes advanced monitoring:

```bash
# Check monitoring service status
systemctl status echotune-monitor

# View monitoring logs
tail -f /opt/echotune/logs/monitor.log

# Check system metrics
cat /opt/echotune/metrics/system_metrics.log
```

### Step 2: Health Check Endpoints

**Available Health Checks:**
- `/health` - Comprehensive system health
- `/health/application` - Application-specific checks
- `/health/database` - Database connectivity
- `/health/system` - System resources
- `/health/ssl` - SSL certificate status
- `/ready` - Readiness probe for load balancers
- `/alive` - Liveness probe

**Example Health Check:**
```bash
curl https://primosphere.studio/health | jq
```

### Step 3: Alerting Configuration

**Email Alerts:**
```env
ALERT_EMAIL=admin@primosphere.studio
SMTP_HOST=smtp.your-provider.com
SMTP_USER=your_username
SMTP_PASS=your_password
```

**Slack Integration:**
```env
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

## Backup Configuration

### Step 1: Automated Backup Setup

The backup system is automatically configured:

```bash
# Run manual backup
cd /opt/echotune
./scripts/backup-system.sh backup

# View backup status
./scripts/backup-system.sh list

# Restore from backup
./scripts/backup-system.sh restore /path/to/backup.tar.gz
```

### Step 2: Backup Scheduling

Backups run automatically via cron:

```bash
# View backup schedule
crontab -l

# Backup runs daily at 2 AM by default
# Logs available in /opt/echotune/logs/backup.log
```

### Step 3: Remote Backup (Optional)

**AWS S3 Configuration:**
```env
REMOTE_BACKUP=true
AWS_S3_BUCKET=your-backup-bucket
AWS_REGION=us-east-1
```

**SSH/SCP Configuration:**
```env
REMOTE_BACKUP=true
REMOTE_BACKUP_PATH=user@backup-server:/path/to/backups
```

## Maintenance Procedures

### Regular Maintenance Tasks

**Daily:**
- Monitor application health via dashboard
- Check system alerts and notifications
- Review error logs for issues

**Weekly:**
- Review system resource usage
- Check backup integrity
- Update dependencies if needed
- Review security logs

**Monthly:**
- Security updates and patches
- Certificate expiry checks
- Performance optimization review
- Backup retention cleanup

### Maintenance Commands

**Application Management:**
```bash
cd /opt/echotune

# View application status
docker-compose ps

# View application logs
docker-compose logs -f app

# Restart application
docker-compose restart app

# Update application
git pull origin main
./scripts/deploy.sh
```

**System Monitoring:**
```bash
# System resource usage
htop

# Disk usage
df -h
ncdu /opt/echotune

# Network connections
ss -tulnp

# Memory usage
free -h
```

**Log Management:**
```bash
# View application logs
tail -f /opt/echotune/logs/app.log

# View nginx logs
tail -f /var/log/nginx/echotune_access.log

# View system logs
journalctl -f -u echotune-monitor
```

## Troubleshooting

### Automated Edge Case Handling

The improved deployment scripts now handle common edge cases automatically:

**Missing .env File:**
```bash
# The scripts will automatically:
# 1. Search multiple locations for .env files
# 2. Create from template if none found
# 3. Apply production defaults
# 4. Provide clear guidance on required values

[ERROR] No .env file found in any of the expected locations:
  - ./.env
  - /opt/echotune/.env
  - /opt/echotune/.env
[ERROR] Please create a .env file with required configuration
[INFO] You can find examples in .env.example or .env.production.example
```

**Partial Environment Configuration:**
```bash
# Automatic validation catches missing variables:
[ERROR] Missing required environment variables:
  - SPOTIFY_CLIENT_ID
  - SPOTIFY_CLIENT_SECRET
[ERROR] Please update your .env file with the missing variables
```

**Invalid Configuration Format:**
```bash
# Smart validation detects common issues:
[WARNING] Environment configuration warnings:
  - SPOTIFY_CLIENT_ID format looks suspicious
  - FRONTEND_URL contains localhost but NODE_ENV is production
```

**Environment File Location Priority:**
1. **Current directory**: `./.env` (highest priority)
2. **Application directory**: `/opt/echotune/.env`
3. **Working directory**: `$(pwd)/.env`

**Automatic Production Updates:**
The scripts automatically update development settings:
- `NODE_ENV=development` → `NODE_ENV=production`
- `FRONTEND_URL=http://localhost:3000` → `FRONTEND_URL=https://your-domain.com`
- `SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/callback` → `SPOTIFY_REDIRECT_URI=https://your-domain.com/auth/callback`

**Repository Cloning Issues:**
```bash
# If you encounter: "fatal: destination path '.' already exists and is not an empty directory"
# The improved deployment scripts now handle this automatically:

[ERROR] Directory /opt/echotune exists but is not a git repository
[ERROR] Found existing files in the directory
[INFO] Please either:
[INFO] 1. Remove the directory: sudo rm -rf /opt/echotune
[INFO] 2. Move existing files to backup location
[INFO] 3. Initialize as git repository manually

# Resolution options:
# Option 1: Clean and restart (recommended for fresh setups)
sudo rm -rf /opt/echotune
./scripts/setup-digitalocean.sh

# Option 2: Backup and clean
sudo mv /opt/echotune /opt/echotune.backup.$(date +%Y%m%d_%H%M%S)
sudo mkdir -p /opt/echotune
./scripts/setup-digitalocean.sh

# Option 3: Manual git initialization (if you have important files)
cd /opt/echotune
git init
git remote add origin https://github.com/dzp5103/Spotify-echo.git
git fetch origin main
git reset --hard origin/main
```

### Common Issues and Solutions

**Environment Configuration Problems:**
```bash
# Test environment detection and validation
cd /opt/echotune

# Check which .env file is being used
./scripts/deploy.sh --dry-run 2>&1 | grep "Found environment file"

# Validate environment without deploying
source scripts/deploy.sh
detect_and_source_env && validate_environment

# Check current environment configuration
docker-compose exec app env | grep -E "(SPOTIFY|NODE_ENV|DOMAIN)"

# Test with production settings
NODE_ENV=production validate_environment
```

**Application Won't Start:**
```bash
# Check Docker status
docker-compose ps

# View detailed logs
docker-compose logs app

# Validate environment is properly loaded
source scripts/deploy.sh && detect_and_source_env && validate_environment

# Check environment configuration in container
docker-compose exec app env | grep -E "(SPOTIFY|NODE_ENV|DOMAIN)"

# Restart services with fresh environment
docker-compose down && docker-compose up -d
```

**SSL Certificate Issues:**
```bash
# Check certificate status
openssl x509 -in /opt/echotune/ssl/primosphere.studio.crt -text -noout

# Renew certificate manually
sudo certbot renew --force-renewal

# Test certificate configuration
curl -I https://primosphere.studio
```

**Database Connection Problems:**
```bash
# Test MongoDB connection
node -e "
const { MongoClient } = require('mongodb');
MongoClient.connect('$MONGODB_URI')
  .then(() => console.log('MongoDB OK'))
  .catch(err => console.error('MongoDB Error:', err));
"

# Test Redis connection
redis-cli -u "$REDIS_URL" ping
```

**Performance Issues:**
```bash
# Check system resources
top
iotop
nethogs

# Check Docker resource usage
docker stats

# Check disk I/O
iostat -x 1

# Optimize if needed
docker system prune -a
```

**Network Connectivity:**
```bash
# Test external connectivity
curl -I https://api.spotify.com

# Check firewall
sudo ufw status verbose

# Test port accessibility
nc -zv primosphere.studio 443
```

### Emergency Procedures

**Application Down:**
1. Check service status: `systemctl status echotune-monitor`
2. Review logs: `docker-compose logs app`
3. Restart services: `docker-compose restart`
4. Check health endpoint: `curl localhost:3000/health`
5. If needed, restore from backup

**Security Incident:**
1. Check fail2ban logs: `sudo fail2ban-client status`
2. Review access logs: `tail -f /var/log/nginx/echotune_access.log`
3. Check for suspicious activity: `sudo ausearch -m avc -ts recent`
4. Block malicious IPs: `sudo ufw deny from MALICIOUS_IP`

**Database Issues:**
1. Check database connectivity in health endpoint
2. Review database logs
3. Test connection manually
4. Restore from backup if needed

## Performance Optimization

### Application Optimization

**Caching Configuration:**
```env
CACHE_ENABLED=true
CACHE_TTL=3600
SPOTIFY_API_CACHE_TTL=300
REDIS_URL=redis://localhost:6379
```

**Performance Settings:**
```env
COMPRESSION=true
CLUSTERING=true
WORKERS=auto
KEEP_ALIVE_TIMEOUT=65000
```

### System Optimization

**Memory Management:**
```bash
# Optimize swap usage
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

# Increase file descriptor limits
echo 'echotune soft nofile 65535' | sudo tee -a /etc/security/limits.conf
echo 'echotune hard nofile 65535' | sudo tee -a /etc/security/limits.conf
```

**Docker Optimization:**
```bash
# Clean up unused resources
docker system prune -a

# Optimize Docker daemon
sudo systemctl edit docker
# Add:
# [Service]
# ExecStart=
# ExecStart=/usr/bin/dockerd --log-driver=json-file --log-opt max-size=10m --log-opt max-file=3
```

### Network Optimization

**nginx Configuration:**
```nginx
# Already optimized in nginx.conf:
- Gzip compression
- Connection keep-alive
- Rate limiting
- Caching headers
- SSL optimization
```

## Scaling Considerations

### Vertical Scaling (Single Server)

**Upgrade Droplet Size:**
1. Create snapshot of current droplet
2. Resize droplet in Digital Ocean dashboard
3. Restart services after resize
4. Monitor performance improvements

**Resource Monitoring:**
```bash
# Monitor resource usage trends
cd /opt/echotune
grep -E "(CPU|Memory|Disk)" metrics/system_metrics.log | tail -100
```

### Horizontal Scaling (Multiple Servers)

**Load Balancer Setup:**
1. Create multiple droplets with same configuration
2. Use Digital Ocean Load Balancer
3. Configure session stickiness or external session store
4. Update DNS to point to load balancer

**Database Scaling:**
1. Use MongoDB Atlas for managed scaling
2. Implement read replicas for better performance
3. Consider sharding for large datasets

**CDN Integration:**
1. Use Digital Ocean Spaces or AWS CloudFront
2. Serve static assets from CDN
3. Cache API responses appropriately

### Monitoring at Scale

**Centralized Logging:**
```bash
# Configure log shipping to external service
# Options: ELK Stack, Splunk, DataDog, LogDNA
```

**Metrics Collection:**
```bash
# Implement metrics collection
# Options: Prometheus + Grafana, DataDog, New Relic
```

## Cost Optimization

### Monthly Cost Breakdown

| Component | Basic Setup | Production Setup |
|-----------|-------------|------------------|
| Droplet | $12/month | $24/month |
| Load Balancer | - | $12/month |
| Backups | $1.20/month | $2.40/month |
| Monitoring | Free | $5-20/month |
| **Total** | **~$13/month** | **~$43-63/month** |

### Cost Optimization Tips

1. **Use appropriate droplet sizes** - Start small, scale as needed
2. **Enable backup retention policies** - Automatic cleanup saves storage costs
3. **Optimize Docker images** - Smaller images reduce bandwidth and storage
4. **Use CDN for static assets** - Reduce server load and bandwidth
5. **Monitor resource usage** - Right-size your infrastructure

## Support and Resources

### Documentation
- [Digital Ocean Documentation](https://docs.digitalocean.com/)
- [Docker Documentation](https://docs.docker.com/)
- [nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

### Monitoring Resources
- Application logs: `/opt/echotune/logs/`
- System metrics: `/opt/echotune/metrics/`
- Health checks: `https://primosphere.studio/health`
- Backup status: `/opt/echotune/backups/`

### Emergency Contacts
- System administrator: `admin@primosphere.studio`
- Digital Ocean support: [Support tickets](https://cloud.digitalocean.com/support)
- Application monitoring: Health check endpoints

---

## 🎉 Congratulations!

Your EchoTune AI application is now deployed with:

✅ **Production-Ready Infrastructure**
✅ **Comprehensive Security**
✅ **Automated Monitoring**
✅ **Backup & Recovery**
✅ **SSL/TLS Encryption**
✅ **Performance Optimization**
✅ **Scalability Planning**

Your application should now be accessible at `https://primosphere.studio` with enterprise-grade reliability and security.

For additional support or questions, please refer to the troubleshooting section or contact the system administrator.