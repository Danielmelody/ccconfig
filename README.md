# Claude Code Configuration Manager

[English](README.md) | [中文](README_zh.md)

Quickly switch between different claude-code providers and start Claude Code with specific profiles.

**Recommended Usage (Easiest):**

```bash
# Add configurations
ccconfig add work
ccconfig add personal

# Start Claude Code directly with a specific profile
ccconfig start work              # During work hours
ccconfig start personal          # After work

# Or use safe mode (requires confirmation for each command)
ccconfig safe-start work
```

**Alternative: Manual Switch Mode:**

```bash
# Switch configuration in current shell
ccconfig use company

# Permanently write to shell config (no need to eval or source each time)
ccconfig use personal --permanent  # or use -p for short
```

## Quick Start

### Installation

```bash
# Install from npm (recommended)
npm install -g ccconfig
```

### Method 1: Direct Start Mode (Recommended)

The easiest way to use ccconfig - directly start Claude Code with a specific profile:

```bash
# 1. Add a configuration (interactive mode)
ccconfig add work
# Follow the prompts to enter:
# - ANTHROPIC_BASE_URL
# - ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY
# - ANTHROPIC_MODEL (optional)
# - ANTHROPIC_SMALL_FAST_MODEL (optional)

# 2. Start Claude Code directly with your profile
ccconfig start work              # Auto-approve mode (adds --dangerously-skip-permissions)
# or
ccconfig safe-start work         # Safe mode (requires confirmation for each command)
```

**That's it!** Claude Code starts with your configuration automatically injected.

**Two modes explained:**

- **`ccconfig start`** - Auto-approve mode
  - Automatically adds `--dangerously-skip-permissions` flag
  - Commands execute without confirmation prompts
  - **Only use with profiles you trust**
  - Perfect for: personal projects, trusted company profiles, rapid development

- **`ccconfig safe-start`** - Safe mode
  - Does NOT add `--dangerously-skip-permissions`
  - Requires manual confirmation before executing each command
  - **Recommended for production or untrusted environments**
  - Perfect for: production systems, new profiles, sensitive data

**Advantages:**
- No shell configuration needed
- No manual switching required
- Environment variables automatically injected
- Works across all shells
- Pass additional arguments: `ccconfig start work /path/to/project --verbose`

### Method 2: Manual Switch Mode

If you prefer to manually switch configurations and start Claude Code separately:

```bash
# 1. Add configuration (interactive mode)
ccconfig add work

# 2. Switch configuration
ccconfig use work

# 3. Apply to current shell (choose one):
eval $(ccconfig env bash)        # Bash/Zsh - temporary
ccconfig env fish | source       # Fish - temporary
ccconfig use work --permanent    # Write to shell config - permanent

# 4. Start Claude Code manually
claude
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
# - ANTHROPIC_MODEL (optional)
# - ANTHROPIC_SMALL_FAST_MODEL (optional)

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

### Update Existing Configuration

If you need to modify an existing configuration, use the `update` command:

```bash
# Update a configuration interactively
ccconfig update work

# The tool will:
# 1. Show current values as defaults
# 2. Prompt for each field
# 3. Press Enter to keep current value, or type new value to update
```

**Example:**
```bash
$ ccconfig update work
Updating configuration 'work'
Press Enter to keep the current value, or enter a new value to update

ANTHROPIC_BASE_URL [https://api.company.com]: https://new-api.company.com
ANTHROPIC_AUTH_TOKEN [sk-ant-api...]: <press Enter to keep>
ANTHROPIC_API_KEY []: sk-new-key-123
ANTHROPIC_MODEL [claude-sonnet-4-5-20250929]: <press Enter to keep>
Do you want to set ANTHROPIC_SMALL_FAST_MODEL? (y/N) [n]:

✓ Configuration 'work' updated
```

**Note:** After updating a configuration, you can either:
- Use `ccconfig start work` to launch Claude Code with the updated profile
- Or use `ccconfig use work` to activate it in current shell

### Shell Completion

ccconfig supports shell completion for commands, profile names, and options. This makes it easier to discover and use commands.

**Features:**
- Command completion (list, add, update, use, remove, etc.)
- Profile name completion (dynamically reads from your configurations)
- Option completion (--permanent, --show-secret, etc.)
- Mode completion (settings, env)
- Format completion (bash, zsh, fish, etc.)

**Installation:**

```bash
# Bash
ccconfig completion bash >> ~/.bashrc
source ~/.bashrc

# Zsh
ccconfig completion zsh >> ~/.zshrc
source ~/.zshrc

# Fish
ccconfig completion fish > ~/.config/fish/completions/ccconfig.fish
# Fish will automatically load it on next startup

# PowerShell
ccconfig completion pwsh >> $PROFILE
# Reload profile: . $PROFILE
```

**Note for PowerShell:** If you get an error about `$PROFILE` not existing, create it first:
```powershell
New-Item -Path $PROFILE -ItemType File -Force
ccconfig completion pwsh >> $PROFILE
. $PROFILE
```

**Usage examples after installing completion:**

```bash
# Type 'ccconfig' and press TAB to see all commands
ccconfig <TAB>
# Shows: list, add, update, use, remove, current, mode, env, edit, completion

# Type 'ccconfig use' and press TAB to see all profiles
ccconfig use <TAB>
# Shows: work, personal, project1, etc.

# Type 'ccconfig mode' and press TAB
ccconfig mode <TAB>
# Shows: settings, env
```

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
