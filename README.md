# Claude Code Configuration Manager

[English](README.md) | [中文](README_zh.md)

Quickly switch between different claude-code providers


```bash
# Switch to work configuration during work hours
ccconfig use company

# Switch back to personal configuration after work
ccconfig use personal

# Permanently write to shell config (no need to eval or source each time)
ccconfig use personal --permanent  # or use -p for short
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

# 4. Apply immediately (choose one method):
# Method A: Temporary (only in current shell)
eval $(ccconfig env bash)  # or use the detected command from output

# Method B: Permanent (write to shell config file)
ccconfig use work --permanent  # or -p for short
# Automatically detects and modifies ~/.bashrc, ~/.zshrc, or config.fish
```

### Settings Mode

Settings Mode directly modifies `~/.claude/settings.json` file, which is Claude Code's native configuration file. This mode is suitable when you don't want to configure shell scripts.

**How it works:**
- Writes environment variables directly into `~/.claude/settings.json` under the `env` field
- Claude Code reads these settings on startup
- No shell configuration required
- Requires Claude Code restart after each switch

**Setup:**

```bash
# 1. Switch to settings mode
ccconfig mode settings

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

# 4. Restart Claude Code
# Configuration is now active!
```

**Verification:**
```bash
# Check current configuration
ccconfig current

# View the settings file directly
cat ~/.claude/settings.json
```

#### ENV Mode Shell Configuration

You have two options to configure shell environment:

**Option 1: Automatic (Recommended)**

Use the `-p/--permanent` flag to automatically write to your shell config:

```bash
# Automatically detects your shell and writes to the appropriate config file
ccconfig use <profile> --permanent

# You will be prompted with:
# - Warning about modifying shell config
# - Target file path
# - Content preview
# - Confirmation prompt (yes/no)

# This will modify:
# - Fish: ~/.config/fish/config.fish
# - Bash: ~/.bashrc
# - Zsh: ~/.zshrc
# - PowerShell: ~/.config/powershell/profile.ps1
```

The tool will add a marked block between `# >>> ccconfig >>>` and `# <<< ccconfig <<<` markers, making it easy to identify and update later.

**Safety Features:**
- **User confirmation required**: You will be prompted before any file is modified
- **Content preview**: Shows exactly what will be written
- **Clear explanation**: Explains what changes will be made
- **Non-destructive**: Existing content is preserved, only the ccconfig block is updated
- **Interactive only**: Requires interactive terminal to prevent accidental modifications

**Option 2: Manual Configuration**

If you prefer to manually configure, add the following to your shell startup files:

**Fish** (`~/.config/fish/config.fish`):
```fish
# Load Claude Code environment variables
set -l ccconfig_env ~/.config/ccconfig/current.env
if test -f $ccconfig_env
    for line in (cat $ccconfig_env)
        set -l parts (string split -m1 '=' $line)
        if test (count $parts) -eq 2
            set -gx $parts[1] $parts[2]
        end
    end
end
```

**Bash** (`~/.bashrc`):
```bash
# Load Claude Code environment variables
if [ -f ~/.config/ccconfig/current.env ]; then
    set -a
    . ~/.config/ccconfig/current.env
    set +a
fi
```

**Zsh** (`~/.zshrc`):
```zsh
# Load Claude Code environment variables
if [ -f ~/.config/ccconfig/current.env ]; then
    set -a
    . ~/.config/ccconfig/current.env
    set +a
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

**Note**: Manual configuration allows you to switch profiles dynamically by changing `current.env`, while `-p/--permanent` writes the values directly into the shell config.

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
1. **Check configuration is written correctly**: 
   ```bash
   ccconfig current
   # Look at section 【1】~/.claude/settings.json
   ```
2. **Verify settings.json directly**:
   ```bash
   cat ~/.claude/settings.json | grep -A 5 '"env"'
   ```
3. **Confirm Claude Code has been restarted**:
   - Completely quit Claude Code (not just close window)
   - Restart the application
4. **Check the `env` field** in `~/.claude/settings.json`:
   ```json
   {
     "env": {
       "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
       "ANTHROPIC_AUTH_TOKEN": "sk-...",
       "ANTHROPIC_API_KEY": "sk-..."
     }
   }
   ```

**ENV Mode**:
1. **Check environment variables file**: 
   ```bash
   cat ~/.config/ccconfig/current.env
   ```
2. **If using --permanent flag**:
   - The tool will show a warning and ask for confirmation before modifying files
   - Check your shell config file has ccconfig block:
     ```bash
     # For bash/zsh
     cat ~/.bashrc | grep -A 5 "ccconfig"
     # For fish
     cat ~/.config/fish/config.fish | grep -A 5 "ccconfig"
     ```
   - Restart shell or run: `source ~/.bashrc` (or equivalent for your shell)
   - Note: You can also use `-p` as a short form of `--permanent`
   - To cancel the operation, type "no" when prompted
   
3. **If using manual configuration or eval command**:
   - Confirm Shell configuration is correct: `cat ~/.bashrc | grep ccconfig`
   - Restart Shell or use `eval $(ccconfig env bash)`
   
4. **Check process environment variables**: 
   ```bash
   ccconfig current
   # Look at section 【3】Current Process Environment Variables
   ```

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

## License

MIT
