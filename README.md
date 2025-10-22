# Claude Code Configuration Manager

Quickly switch between different claude-code providers


```bash
# Switch to work configuration during work hours
ccconfig use company

# Switch back to personal configuration after work
ccconfig use personal
```

## Quick Start

### Installation

```bash
# Install from npm (recommended)
npm install -g ccconfig
```

### ENV Mode (Recommended, Default)

```bash
# 1. Configure Shell auto-loading (see below)

# 2. Add configuration (interactive mode)
ccconfig add
# Follow the prompts to enter:
# - Name
# - ANTHROPIC_BASE_URL
# - ANTHROPIC_AUTH_TOKEN
# - ANTHROPIC_API_KEY
# - Description

# 3. Switch configuration
ccconfig use work

# 4. Restart Shell or apply immediately
eval $(ccconfig env bash)  # or use the detected command from output
```

### Settings Mode

```bash
# 1. Switch to settings mode
ccconfig mode settings

# 2. Add configuration (interactive mode)
ccconfig add
# Follow the prompts to configure

# 3. Switch configuration
ccconfig use work

# 4. Restart Claude Code
# Configuration is now active!
```

#### ENV Mode Shell Configuration

Configure once by adding to your Shell startup files:

**Fish** (`~/.config/fish/config.fish`):
```fish
# Load Claude Code environment variables
set -l ccconfig_env ~/.config/ccconfig/current.env
if test -f $ccconfig_env
    for line in (cat $ccconfig_env)
        set -l parts (string split '=' $line)
        set -gx $parts[1] $parts[2]
    end
end
```

**Bash** (`~/.bashrc`):
```bash
# Load Claude Code environment variables
if [ -f ~/.config/ccconfig/current.env ]; then
    export $(grep -v '^#' ~/.config/ccconfig/current.env | xargs)
fi
```

**Zsh** (`~/.zshrc`):
```zsh
# Load Claude Code environment variables
if [ -f ~/.config/ccconfig/current.env ]; then
    export $(grep -v '^#' ~/.config/ccconfig/current.env | xargs)
fi
```

**PowerShell** (`$PROFILE`):
```powershell
# Load Claude Code environment variables
$cconfigEnv = "$env:USERPROFILE\.config\ccconfig\current.env"
if (Test-Path $cconfigEnv) {
    Get-Content $cconfigEnv | ForEach-Object {
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
ccconfig

# List all configurations
ccconfig list

# Add new configuration (interactive mode only, auto-creates config file on first use)
ccconfig add

# Switch configuration
ccconfig use <name>

# Remove configuration
ccconfig remove <name>

# View current status (shows all configuration sources)
ccconfig current
ccconfig current --show-secret  # Show full token

# Show configuration file path
ccconfig edit

# View version
ccconfig --version  # or -V
```

### Mode Management

```bash
# View current mode
ccconfig mode

# Switch to settings mode
ccconfig mode settings

# Switch to env mode
ccconfig mode env
```

### ENV Mode Specific

```bash
# Apply immediately in current Shell (env mode)
eval $(ccconfig env bash)      # Bash/Zsh
ccconfig env fish | source     # Fish
ccconfig env pwsh | iex        # PowerShell

# Output .env format
ccconfig env dotenv > .env
```

## Configuration File Locations

- **Configuration List**: `~/.config/ccconfig/profiles.json`
- **Claude Settings**: `~/.claude/settings.json`
- **Environment Variables File**: `~/.config/ccconfig/current.env`
- **Mode Settings**: `~/.config/ccconfig/mode`

## Configuration Example

`~/.config/ccconfig/profiles.json`:

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
alias ccs='ccconfig'
alias ccs-use='ccconfig use'
alias ccs-list='ccconfig list'
alias ccs-current='ccconfig current'

# Fish (~/.config/fish/config.fish)
abbr ccs 'ccconfig'
abbr ccs-use 'ccconfig use'
abbr ccs-list 'ccconfig list'
```

### Project-Level Configuration

For specific projects, you can export .env files:

```bash
# Export to project directory
cd my-project
ccconfig use project-config
ccconfig env dotenv > .env

# Use project configuration
source .env
```

### Backup and Synchronization

```bash
# Backup configuration
cp ~/.config/ccconfig/profiles.json ~/backup/ccconfig-profiles.json

# Sync to new machine
scp ~/backup/ccconfig-profiles.json new-machine:~/.config/ccconfig/

# Or use version control (be careful with security!)
cd ~/.config/ccconfig
git init
echo "*.env" >> .gitignore
git add profiles.json
git commit -m "ccconfig profiles"
```

## Troubleshooting

### Configuration Not Taking Effect

**Settings Mode**:
1. Check if configuration is written correctly: `ccconfig current`
2. Confirm Claude Code has been restarted
3. Check the `env` field in `~/.claude/settings.json`

**ENV Mode**:
1. Check environment variables file: `cat ~/.config/ccconfig/current.env`
2. Confirm Shell configuration is correct: `cat ~/.bashrc | grep ccconfig`
3. Restart Shell or use `eval $(ccconfig env bash)`
4. Check process environment variables: `ccconfig current`

### Configuration Lost After Mode Switch

Switching modes does not affect saved configurations, only changes how configurations are applied. After switching, you need to `use` once more:

```bash
ccconfig mode env          # Switch to env mode
ccconfig use work          # Reapply configuration
```

### File Permission Issues

```bash
# Fix configuration file permissions
chmod 600 ~/.config/ccconfig/profiles.json
chmod 600 ~/.claude/settings.json
chmod 600 ~/.config/ccconfig/current.env
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
- Configuration file location: `%USERPROFILE%\.config\ccconfig\`
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
cat ~/.config/ccconfig/profiles.json | \
  jq '.profiles | map_values({baseUrl, description})' > team-config.json

# Team members manually add their own API keys after importing
```

## Development

### Project Structure

```
.
├── ccconfig.js         # Core script
├── package.json             # npm configuration
├── README.md                # This document
└── .gitignore               # Git ignore file
```

### Testing

```bash
# Test version output
node ccconfig.js --version

# Test adding configuration (interactive only)
node ccconfig.js add

# Test listing
node ccconfig.js list

# Test switching
node ccconfig.js use test

# Test status viewing
node ccconfig.js current
node ccconfig.js current --show-secret

# Test mode switching
node ccconfig.js mode
node ccconfig.js mode env
```

## License

MIT
