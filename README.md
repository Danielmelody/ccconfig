# Claude Code Configuration Manager

Quickly switch between different claude-code providers


```bash
# Switch to work configuration during work hours
cc-manager use company

# Switch back to personal configuration after work
cc-manager use personal
```

## Quick Start

### Installation

```bash
# Install from npm (recommended)
npm install -g @danielhu/cc-manager
```

### ENV Mode (Recommended, Default)

```bash
# 1. Configure Shell auto-loading (see below)

# 2. Add configuration (interactive mode)
cc-manager add
# Follow the prompts to enter:
# - Name
# - ANTHROPIC_BASE_URL
# - ANTHROPIC_AUTH_TOKEN
# - ANTHROPIC_API_KEY
# - Description

# 3. Switch configuration
cc-manager use work

# 4. Restart Shell or apply immediately
eval $(cc-manager env bash)  # or use the detected command from output
```

### Settings Mode

```bash
# 1. Switch to settings mode
cc-manager mode settings

# 2. Add configuration (interactive mode)
cc-manager add
# Follow the prompts to configure

# 3. Switch configuration
cc-manager use work

# 4. Restart Claude Code
# Configuration is now active!
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
# Run without command (defaults to list)
cc-manager

# List all configurations
cc-manager list

# Add new configuration (interactive mode only, auto-creates config file on first use)
cc-manager add

# Switch configuration
cc-manager use <name>

# Remove configuration
cc-manager remove <name>

# View current status (shows all configuration sources)
cc-manager current
cc-manager current --show-secret  # Show full token

# Show configuration file path
cc-manager edit

# View version
cc-manager --version  # or -V
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
    "work": {
      "env": {
        "ANTHROPIC_BASE_URL": "https://api-proxy.company.com",
        "ANTHROPIC_AUTH_TOKEN": "sk-auth-work-xxxxx",
        "ANTHROPIC_API_KEY": "sk-key-work-xxxxx"
      },
      "description": "Work account"
    },
    "personal": {
      "env": {
        "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
        "ANTHROPIC_AUTH_TOKEN": "sk-ant-personal-xxxxx",
        "ANTHROPIC_API_KEY": "sk-ant-personal-xxxxx"
      },
      "description": "Personal account"
    }
  }
}
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
- **ENV mode** is recommended (default, better cross-shell support, instant apply)
- If you prefer not to configure shell startup files, **Settings mode** can be simpler (only needs Claude Code restart)

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
# Test version output
node cc-manager.js --version

# Test adding configuration (interactive only)
node cc-manager.js add

# Test listing
node cc-manager.js list

# Test switching
node cc-manager.js use test

# Test status viewing
node cc-manager.js current
node cc-manager.js current --show-secret

# Test mode switching
node cc-manager.js mode
node cc-manager.js mode env
```

## License

MIT
