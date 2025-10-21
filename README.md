# Claude Code Configuration Manager

A Node.js tool for quickly switching Claude Code API configurations (BASE_URL, AUTH_TOKEN, and API_KEY).

## Features

- **Dual Mode Support**: Settings mode (recommended) and ENV mode
- **Zero Shell Dependencies**: Settings mode requires no Shell configuration
- **Cross-Platform**: Full support for Windows, macOS, and Linux
- **Multi-Configuration Management**: Easily manage and switch between multiple API configurations
- **Configuration Visibility**: View status from all configuration sources simultaneously
- **Security**: Automatic file permissions, sensitive information hidden by default

## Mode Comparison

### Settings Mode (Recommended)

- **Principle**: Directly modify the `env` field in `~/.claude/settings.json`
- **Advantages**: No Shell configuration required, works out of the box
- **Use Case**: Using only one Shell, or prefer not to configure Shell
- **Activation**: Restart Claude Code

### ENV Mode

- **Principle**: Write to environment variable files, loaded when Shell starts
- **Advantages**: Cross-Shell configuration sharing (Fish, Bash, Zsh, etc.)
- **Use Case**: Using multiple Shells, want configuration synchronization
- **Activation**: Restart Shell or use `env` command for immediate effect

## Quick Start

### Installation

```bash
# Method 1: Global installation
chmod +x cc-manager.js
sudo ln -s $(pwd)/cc-manager.js /usr/local/bin/cc-manager

# Method 2: Using npm
npm install -g .
```

### Settings Mode (Recommended)

```bash
# 1. Initialize in settings mode
cc-manager init settings

# 2. Add configuration (interactive prompts for missing parameters)
cc-manager add work https://api.example.com sk-auth-work sk-key-work "Work account"

# 3. Switch configuration
cc-manager use work

# 4. Restart Claude Code
# Configuration is now active!
```

### ENV Mode (Cross-Shell)

```bash
# 1. Initialize in env mode
cc-manager init env

# 2. Configure Shell auto-loading (see below)

# 3. Add configuration (interactive prompts for missing parameters)
cc-manager add work https://api.example.com sk-auth-work sk-key-work "Work account"

# 4. Switch configuration
cc-manager use work

# 5. Restart Shell or apply immediately
eval $(cc-manager env bash)
```

#### ENV Mode Shell Configuration

Configure once by adding to your Shell startup files:

**Fish** (`~/.config/fish/config.fish`):
```fish
# Load Claude Code environment variables
set -l claude_env ~/.config/claude-code/current.env
if test -f $claude_env
    for line in (cat $claude_env)
        set -l parts (string split '=' $line)
        set -gx $parts[1] $parts[2]
    end
end
```

**Bash** (`~/.bashrc`):
```bash
# Load Claude Code environment variables
if [ -f ~/.config/claude-code/current.env ]; then
    export $(grep -v '^#' ~/.config/claude-code/current.env | xargs)
fi
```

**Zsh** (`~/.zshrc`):
```zsh
# Load Claude Code environment variables
if [ -f ~/.config/claude-code/current.env ]; then
    export $(grep -v '^#' ~/.config/claude-code/current.env | xargs)
fi
```

**PowerShell** (`$PROFILE`):
```powershell
# Load Claude Code environment variables
$claudeEnv = "$env:USERPROFILE\.config\claude-code\current.env"
if (Test-Path $claudeEnv) {
    Get-Content $claudeEnv | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
}
```

## Command Reference

### Basic Commands

```bash
# Initialize (select mode)
cc-manager init [settings|env]

# List all configurations
cc-manager list

# Add new configuration
cc-manager add <name> [baseUrl] [authToken] [apiKey] [description]

# Switch configuration
cc-manager use <name>

# Remove configuration
cc-manager remove <name>

# View current status (shows all configuration sources)
cc-manager current
cc-manager current --show-secret  # Show full token

# Edit configuration file
cc-manager edit
```

### Mode Management

```bash
# View current mode
cc-manager mode

# Switch to settings mode
cc-manager mode settings

# Switch to env mode
cc-manager mode env
```

### ENV Mode Specific

```bash
# Apply immediately in current Shell (env mode)
eval $(cc-manager env bash)      # Bash/Zsh
cc-manager env fish | source     # Fish
cc-manager env pwsh | iex        # PowerShell

# Output .env format
cc-manager env dotenv > .env
```

## Configuration File Locations

- **Configuration List**: `~/.config/claude-code/profiles.json`
- **Claude Settings**: `~/.claude/settings.json`
- **Environment Variables File**: `~/.config/claude-code/current.env`
- **Mode Settings**: `~/.config/claude-code/mode`

## Configuration Example

`~/.config/claude-code/profiles.json`:

```json
{
  "profiles": {
    "default": {
      "env": {
        "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
        "ANTHROPIC_AUTH_TOKEN": "sk-ant-default-xxxxxxxx",
        "ANTHROPIC_API_KEY": "sk-ant-default-xxxxxxxx"
      },
      "description": "Official API"
    },
    "work": {
      "env": {
        "ANTHROPIC_BASE_URL": "https://api-proxy.company.com",
        "ANTHROPIC_AUTH_TOKEN": "sk-auth-work-yyyyyyyy",
        "ANTHROPIC_API_KEY": "sk-key-work-yyyyyyyy"
      },
      "description": "Company Proxy"
    },
    "local": {
      "env": {
        "ANTHROPIC_BASE_URL": "http://localhost:8080",
        "ANTHROPIC_API_KEY": "test-key"
      },
      "description": "Local Testing"
    }
  }
}
```

## Usage Scenarios

### Scenario 1: Work and Personal API Switching

```bash
# Add work and personal configurations
cc-manager add company https://api-proxy.work.com sk-auth-work sk-key-work "Work"
cc-manager add personal https://api.anthropic.com sk-auth-personal sk-key-personal "Personal"

# Switch to work configuration during work hours
cc-manager use company

# Switch back to personal configuration after work
cc-manager use personal
```

### Scenario 2: Multi-Environment Development

```bash
# Add different environments
cc-manager add prod https://api.anthropic.com sk-auth-prod sk-key-prod "Production"
cc-manager add staging https://staging.example.com sk-auth-staging sk-key-staging "Staging"
cc-manager add dev http://localhost:8080 dev-auth dev-key "Local"

# Switch as needed
cc-manager use dev
```

### Scenario 3: Viewing Configuration Status

```bash
# View all configuration sources
cc-manager current

# Output example:
# ═══════════════════════════════════════════
# Claude Code Configuration Status
# ═══════════════════════════════════════════
#
# Current Mode: settings
# Active Configuration: work
#
# 【1】~/.claude/settings.json:
#   ANTHROPIC_BASE_URL:   https://api-proxy.work.com
#   ANTHROPIC_AUTH_TOKEN: sk-ant-work-yyyyyyyy...
#
# 【2】Environment Variables File:
#   (Not configured)
#
# 【3】Current Process Environment Variables:
#   (Not set)
#
# ───────────────────────────────────────────
# Notes:
#   • Settings mode: Claude Code reads from 【1】
#   • ENV mode: Claude Code reads from 【3】(loaded from 【2】)
#
# Use --show-secret to display full token
# ═══════════════════════════════════════════
```

## Advanced Usage

### Quick Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc
alias ccs='cc-manager'
alias ccs-use='cc-manager use'
alias ccs-list='cc-manager list'
alias ccs-current='cc-manager current'

# Fish (~/.config/fish/config.fish)
abbr ccs 'cc-manager'
abbr ccs-use 'cc-manager use'
abbr ccs-list 'cc-manager list'
```

### Project-Level Configuration

For specific projects, you can export .env files:

```bash
# Export to project directory
cd my-project
cc-manager use project-config
cc-manager env dotenv > .env

# Use project configuration
source .env
```

### Backup and Synchronization

```bash
# Backup configuration
cp ~/.config/claude-code/profiles.json ~/backup/claude-profiles.json

# Sync to new machine
scp ~/backup/claude-profiles.json new-machine:~/.config/claude-code/

# Or use version control (be careful with security!)
cd ~/.config/claude-code
git init
echo "*.env" >> .gitignore
git add profiles.json
git commit -m "Claude Code profiles"
```

## Troubleshooting

### Configuration Not Taking Effect

**Settings Mode**:
1. Check if configuration is written correctly: `cc-manager current`
2. Confirm Claude Code has been restarted
3. Check the `env` field in `~/.claude/settings.json`

**ENV Mode**:
1. Check environment variables file: `cat ~/.config/claude-code/current.env`
2. Confirm Shell configuration is correct: `cat ~/.bashrc | grep claude`
3. Restart Shell or use `eval $(cc-manager env bash)`
4. Check process environment variables: `cc-manager current`

### Configuration Lost After Mode Switch

Switching modes does not affect saved configurations, only changes how configurations are applied. After switching, you need to `use` once more:

```bash
cc-manager mode env          # Switch to env mode
cc-manager use work          # Reapply configuration
```

### File Permission Issues

```bash
# Fix configuration file permissions
chmod 600 ~/.config/claude-code/profiles.json
chmod 600 ~/.claude/settings.json
chmod 600 ~/.config/claude-code/current.env
```

## Security Considerations

1. **File Permissions**: The tool automatically sets configuration files to 600 permissions (owner read/write only)

2. **Sensitive Information**:
   - API keys are hidden by default, use `--show-secret` to view full values
   - Do not commit configuration files to public repositories
   - Use `.gitignore` to exclude sensitive files

3. **Environment Variables**: ENV mode environment variables are inherited by child processes, be mindful of security

4. **Version Control**: If version controlling configurations, use encryption or private repositories

## Frequently Asked Questions

**Q: Which is better, Settings mode or ENV mode?**

A:
- If using only one Shell, **Settings mode** is recommended (simpler)
- If using multiple Shells (e.g., Fish + Bash), **ENV mode** is recommended (configuration synchronization)

**Q: Can I use both modes simultaneously?**

A: Not recommended. Claude Code reads configuration based on priority:
- Settings mode: Reads directly from `settings.json`
- ENV mode: Reads from environment variables

Using both simultaneously may cause confusion.

**Q: How to use on Windows?**

A: Fully supported on Windows:
- Configuration file location: `%USERPROFILE%\.config\claude-code\`
- Settings mode requires no additional configuration
- ENV mode uses PowerShell configuration

**Q: Do I need to restart after switching configurations?**

A:
- **Settings mode**: Need to restart Claude Code
- **ENV mode**: Need to restart Shell (or use `env` command for immediate effect)

**Q: Can I export configurations for team use?**

A: Yes, but be careful:
```bash
# Export configuration structure (excluding API keys)
cat ~/.config/claude-code/profiles.json | \
  jq '.profiles | map_values({baseUrl, description})' > team-config.json

# Team members manually add their own API keys after importing
```

## Development

### Project Structure

```
.
├── cc-manager.js         # Core script
├── package.json             # npm configuration
├── README.md                # This document
└── .gitignore               # Git ignore file
```

### Testing

```bash
# Test help
node cc-manager.js help

# Test initialization
node cc-manager.js init settings

# Test adding configuration
node cc-manager.js add test http://localhost:8080 test-key "Test"

# Test listing
node cc-manager.js list

# Test switching
node cc-manager.js use test

# Test status viewing
node cc-manager.js current
node cc-manager.js current --show-secret
```

## License

MIT
