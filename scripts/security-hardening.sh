#!/bin/bash

# EchoTune AI - Production Security Hardening Script
# Run this after initial deployment to secure the server

set -e

echo "🔒 EchoTune AI - Security Hardening"
echo "================================="

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install security tools
echo "🛡️  Installing security tools..."
sudo apt install -y fail2ban ufw unattended-upgrades

# Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Configure fail2ban
echo "🚫 Configuring fail2ban..."
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Create nginx fail2ban jail
sudo tee /etc/fail2ban/jail.d/nginx.conf > /dev/null <<EOF
[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/echotune_error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/echotune_error.log
maxretry = 10
findtime = 600
bantime = 7200
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

# Configure automatic security updates
echo "🔄 Configuring automatic security updates..."
sudo tee /etc/apt/apt.conf.d/50unattended-upgrades > /dev/null <<EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}";
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}ESM:\${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

sudo systemctl enable unattended-upgrades

# Secure SSH (if not already done)
echo "🔐 Securing SSH..."
sudo sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Set up log rotation
echo "📋 Configuring log rotation..."
sudo tee /etc/logrotate.d/echotune > /dev/null <<EOF
/var/log/nginx/echotune_*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload nginx
    endscript
}

/opt/echotune/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF

# Create monitoring systemd service
echo "📊 Setting up monitoring service..."
sudo cp /opt/echotune/scripts/monitor.sh /usr/local/bin/echotune-monitor
sudo chmod +x /usr/local/bin/echotune-monitor

sudo tee /etc/systemd/system/echotune-monitor.service > /dev/null <<EOF
[Unit]
Description=EchoTune AI Health Monitor
After=network.target

[Service]
Type=simple
User=echotune
ExecStart=/usr/local/bin/echotune-monitor
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable echotune-monitor
sudo systemctl start echotune-monitor

# Install and configure system monitoring
echo "📈 Installing system monitoring..."
sudo apt install -y htop iotop nethogs

echo ""
echo "✅ Security hardening complete!"
echo ""
echo "📊 Security status:"
echo "   ✅ Firewall configured and enabled"
echo "   ✅ Fail2ban configured for nginx"
echo "   ✅ Automatic security updates enabled"
echo "   ✅ SSH hardened"
echo "   ✅ Log rotation configured"
echo "   ✅ Health monitoring service started"
echo ""
echo "🔍 Check status with:"
echo "   sudo ufw status"
echo "   sudo fail2ban-client status"
echo "   systemctl status echotune-monitor"