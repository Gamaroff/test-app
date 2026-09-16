---
name: server-admin
description: Sysadmin operations on a LAN server via SSH. Covers apt updates, ufw firewall rules, systemd service management, user/group management, disk and memory diagnostics, log inspection, and routine maintenance. Use for any non-Docker server-side task.
type: project
---

# Server Admin Skill

System administration for a LAN deploy server. Use for OS-level work — package management, firewall, services, users, logs, hardware checks. For Docker/container ops use the `deploy-remote` skill.

## When to Use This Skill

- Updating packages (`apt update`, security patches)
- Adding/modifying ufw firewall rules
- Managing systemd services (start, stop, enable, view status)
- Adding users, granting sudo, managing SSH keys for additional users
- Diagnosing disk full, memory pressure, high load
- Reading system logs (`journalctl`, `/var/log/`)
- Configuring cron jobs, swap, sysctl tunables
- Renewing certificates, rotating credentials
- General server maintenance and uptime work

**Do NOT use** for:

- Docker stack deploys (use `deploy-remote`)
- Docker container troubleshooting (use `deploy-remote` or `docker`)
- Application-level config (env vars, prisma migrations) — those belong with the app

## Connection

Standard alias from `setup-ssh.sh`:

```bash
ssh <your-server>                 # interactive
ssh <your-server> '<command>'     # one-shot
ssh -t <your-server> 'sudo ...'   # sudo (TTY for password prompt)
```

User has `sudo` (member of `su` / `sudo` group). Most ops below require sudo.

## Quick Reference

### System info

```bash
ssh <your-server> 'uname -a; lsb_release -a; uptime; free -h; df -h'
```

### Package management

```bash
# Update package index
ssh -t <your-server> 'sudo apt update'

# Upgrade installed packages (security + bugfix)
ssh -t <your-server> 'sudo apt upgrade -y'

# Full distribution upgrade (kernel, libc — reboot may be needed)
ssh -t <your-server> 'sudo apt full-upgrade -y'

# Install / remove a package
ssh -t <your-server> 'sudo apt install -y htop tmux jq'
ssh -t <your-server> 'sudo apt remove --purge -y <pkg>'

# Reboot if required (check /var/run/reboot-required)
ssh <your-server> 'test -f /var/run/reboot-required && echo "REBOOT NEEDED" || echo "no reboot needed"'
ssh -t <your-server> 'sudo reboot'
```

### Firewall (ufw)

```bash
# View rules
ssh <your-server> 'sudo ufw status numbered'

# Allow a port from LAN only
ssh -t <your-server> 'sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp comment "{service-name}"'

# Delete rule by number
ssh -t <your-server> 'sudo ufw delete 5'

# Disable / enable
ssh -t <your-server> 'sudo ufw disable'
ssh -t <your-server> 'sudo ufw --force enable'
```

**Default policy** (set by `bootstrap-remote.sh`):
- Deny incoming, allow outgoing
- Allow 22/tcp (ssh) from anywhere
- Allow 5000/tcp (registry), 3000/tcp (api), 5432/5434 (postgres), 6379/6380 (redis), 5435/6382 (web stack) from `192.168.1.0/24` only

### Systemd services

```bash
# Status
ssh <your-server> 'systemctl status docker'
ssh <your-server> 'systemctl status ufw'

# Start / stop / restart / reload
ssh -t <your-server> 'sudo systemctl restart docker'

# Enable / disable on boot
ssh -t <your-server> 'sudo systemctl enable docker'

# List failed units
ssh <your-server> 'systemctl --failed'

# Recent logs for a service
ssh <your-server> 'journalctl -u docker -n 100 --no-pager'

# Follow live
ssh <your-server> 'sudo journalctl -u docker -f'
```

### User & SSH key management

```bash
# List users with shells
ssh <your-server> 'getent passwd | grep -v nologin'

# Add a user with sudo
ssh -t <your-server> 'sudo adduser --gecos "" newdev && sudo usermod -aG sudo,docker newdev'

# Authorize an SSH key for an existing user
PUBKEY=$(cat ~/.ssh/some_user_key.pub)
ssh -t <your-server> "sudo -u newdev mkdir -p /home/newdev/.ssh && echo '$PUBKEY' | sudo tee -a /home/newdev/.ssh/authorized_keys && sudo chown -R newdev:newdev /home/newdev/.ssh && sudo chmod 700 /home/newdev/.ssh && sudo chmod 600 /home/newdev/.ssh/authorized_keys"

# Remove a user (keep home for archival)
ssh -t <your-server> 'sudo deluser newdev'
```

### Disk & memory

```bash
# Disk usage by mount
ssh <your-server> 'df -h'

# Top 10 largest dirs under /var (typical culprits)
ssh -t <your-server> 'sudo du -hx /var --max-depth=1 2>/dev/null | sort -rh | head -10'

# Largest Docker images / volumes
ssh <your-server> 'docker system df -v'

# Memory pressure
ssh <your-server> 'free -h; cat /proc/pressure/memory 2>/dev/null'

# Top processes by RSS
ssh <your-server> 'ps aux --sort=-%mem | head -10'
```

### Logs

```bash
# Kernel
ssh <your-server> 'sudo dmesg -T | tail -50'

# All journalctl since today, errors only
ssh <your-server> 'sudo journalctl --since today -p err --no-pager'

# auth.log (failed sshd, sudo)
ssh <your-server> 'sudo tail -50 /var/log/auth.log'

# Docker daemon
ssh <your-server> 'sudo journalctl -u docker --since "1 hour ago" --no-pager'
```

### Cron / scheduled jobs

```bash
# View user crontab
ssh <your-server> 'crontab -l'

# View system crontab
ssh <your-server> 'sudo cat /etc/crontab; ls /etc/cron.d/'

# Edit user crontab (interactive)
ssh -t <your-server> 'crontab -e'
```

### Swap & sysctl

```bash
# Swap status
ssh <your-server> 'swapon --show; free -h'

# Sysctl current value
ssh <your-server> 'sysctl vm.swappiness'

# Persistent sysctl override (idempotent)
ssh -t <your-server> 'echo "net.core.somaxconn=4096" | sudo tee /etc/sysctl.d/99-{app-name}-net.conf && sudo sysctl -p /etc/sysctl.d/99-{app-name}-net.conf'
```

### File transfer

```bash
# Send a file
scp ./local.sql <your-server>:/tmp/

# Pull a file
scp <your-server>:/var/log/syslog ./

# Sync a directory (mirror, delete extras)
rsync -avz --delete ./build/ <your-server>:/srv/{app-name}/build/
```

## Common Workflows

### Routine weekly maintenance

```bash
ssh -t <your-server> '
  sudo apt update &&
  sudo apt upgrade -y &&
  sudo apt autoremove -y &&
  docker system prune -af --filter "until=168h"
'
ssh <your-server> 'test -f /var/run/reboot-required && echo "REBOOT NEEDED"'
```

### Diagnose "server is slow"

```bash
bash scripts/server/remote-status.sh
ssh <your-server> '
  echo "=== load ==="; uptime
  echo "=== top cpu ==="; ps aux --sort=-%cpu | head -10
  echo "=== top mem ==="; ps aux --sort=-%mem | head -10
  echo "=== iowait ==="; vmstat 1 3
  echo "=== docker stats ==="; docker stats --no-stream
'
```

### Onboard a new dev to the server

1. Get their public key (e.g. `id_ed25519.pub`)
2. Add a user with sudo + docker group (see User & SSH key section)
3. Have them clone repo locally, run `setup-ssh.sh` with `MY_APP_SERVER_USER=<their_username>`
4. Confirm with `bash scripts/server/remote-status.sh`

### Recover from "out of disk"

```bash
# 1. Find biggest offenders
ssh -t <your-server> 'sudo du -hx / --max-depth=2 2>/dev/null | sort -rh | head -20'

# 2. Most common culprit: docker
ssh <your-server> 'docker system df'
ssh <your-server> 'docker system prune -af --volumes'

# 3. Old journal logs
ssh -t <your-server> 'sudo journalctl --vacuum-time=7d'

# 4. Old apt cache
ssh -t <your-server> 'sudo apt clean'
```

## Constraints

- Server runs Ubuntu/Debian — commands assume `apt`, `systemd`, `ufw`
- Single LAN server; no config management (Ansible/Chef) yet
- No remote backup target configured; use Railway-side backups for prod data

## Related

- **`deploy-remote` skill** — Docker stack ops on this same server
- **`scripts/server/bootstrap-remote.sh`** — initial provisioning script (re-run for drift fixes)
- **`scripts/server/remote-status.sh`** — read-only health snapshot
