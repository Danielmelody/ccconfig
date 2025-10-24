# Claude Code 配置管理器

[English](README.md) | [中文](README_zh.md)

快速切换不同的 claude-code 提供商配置，并使用指定配置启动 Claude Code。

**推荐用法（最简单）：**

```bash
# 添加配置
ccconfig add work
ccconfig add personal

# 直接使用指定配置启动 Claude Code
ccconfig start work              # 工作时间
ccconfig start personal          # 下班后

# 或使用安全模式（每个命令都需要确认）
ccconfig safe-start work
```

**备选方案：手动切换模式：**

```bash
# 在当前 shell 中切换配置
ccconfig use company

# 永久写入 shell 配置文件（无需每次 eval 或 source）
ccconfig use personal --permanent  # 或使用 -p 简写
```

## 快速开始

### 安装

```bash
# 从 npm 安装（推荐）
npm install -g ccconfig
```

### 方式 1：直接启动模式（推荐 🚀）

最简单的使用方式 - 直接使用指定配置启动 Claude Code：

```bash
# 1. 添加配置（交互模式）
ccconfig add work
# 按提示输入：
# - ANTHROPIC_BASE_URL
# - ANTHROPIC_AUTH_TOKEN 或 ANTHROPIC_API_KEY
# - ANTHROPIC_MODEL（可选）
# - ANTHROPIC_SMALL_FAST_MODEL（可选）

# 2. 直接使用配置启动 Claude Code
ccconfig start work              # 自动批准模式（添加 --dangerously-skip-permissions）
# 或
ccconfig safe-start work         # 安全模式（每个命令需要确认）
```

**就这么简单！** Claude Code 会自动注入您的配置启动。

**两种模式说明：**

- **`ccconfig start`** - 自动批准模式
  - 自动添加 `--dangerously-skip-permissions` 标志
  - 命令无需确认直接执行
  - ⚠️ **仅在您信任的配置中使用**
  - 适用场景：个人项目、可信的公司配置、快速开发

- **`ccconfig safe-start`** - 安全模式
  - 不添加 `--dangerously-skip-permissions`
  - 执行每个命令前需要手动确认
  - ✅ **推荐用于生产环境或不可信环境**
  - 适用场景：生产系统、新配置、敏感数据

**优势：**
- ✅ 无需配置 shell
- ✅ 无需手动切换
- ✅ 自动注入环境变量
- ✅ 支持所有 shell
- ✅ 可传递额外参数：`ccconfig start work /path/to/project --verbose`

### 方式 2：手动切换模式

如果您更喜欢手动切换配置，然后单独启动 Claude Code：

```bash
# 1. 添加配置（交互模式）
ccconfig add work

# 2. 切换配置
ccconfig use work

# 3. 应用到当前 shell（选择一种）：
eval $(ccconfig env bash)        # Bash/Zsh - 临时生效
ccconfig env fish | source       # Fish - 临时生效
ccconfig use work --permanent    # 写入 shell 配置 - 永久生效

# 4. 手动启动 Claude Code
claude
```

### Settings 模式

Settings 模式直接修改 `~/.claude/settings.json` 文件，这是 Claude Code 的原生配置文件。此模式适合不想配置 shell 脚本的情况。

**工作原理：**
- 直接将环境变量写入 `~/.claude/settings.json` 的 `env` 字段
- Claude Code 启动时读取这些设置
- 无需 shell 配置
- 每次切换后需要重启 Claude Code

**设置步骤：**

```bash
# 1. 切换到 settings 模式
ccconfig mode settings

# 2. 添加配置（交互模式）
ccconfig add
# 按提示输入：
# - 名称
# - ANTHROPIC_BASE_URL
# - ANTHROPIC_AUTH_TOKEN
# - ANTHROPIC_API_KEY
# - ANTHROPIC_MODEL（可选）
# - ANTHROPIC_SMALL_FAST_MODEL（可选）

# 3. 切换配置
ccconfig use work

# 4. 重启 Claude Code
# 配置现已生效！
```

**验证：**
```bash
# 查看当前配置
ccconfig current

# 直接查看 settings 文件
cat ~/.claude/settings.json
```

#### ENV 模式 Shell 配置

您有两种方式配置 shell 环境：

**方式 1: 自动配置（推荐）**

使用 `-p/--permanent` 标志自动写入您的 shell 配置：

```bash
# 自动检测您的 shell 并写入相应的配置文件
ccconfig use <profile> --permanent

# 您将看到：
# - 修改 shell 配置的警告
# - 目标文件路径
# - 内容预览
# - 确认提示（yes/no）

# 这将修改：
# - Fish: ~/.config/fish/config.fish
# - Bash: ~/.bashrc
# - Zsh: ~/.zshrc
# - PowerShell: ~/.config/powershell/profile.ps1
```

工具会在 `# >>> ccconfig >>>` 和 `# <<< ccconfig <<<` 标记之间添加一个标记块，便于后续识别和更新。

**安全特性：**
- **需要用户确认**: 修改文件前会提示确认
- **内容预览**: 显示将要写入的确切内容
- **清晰说明**: 解释将要进行的更改
- **非破坏性**: 保留现有内容，仅更新 ccconfig 块
- **仅交互模式**: 需要交互式终端以防止意外修改

**方式 2: 手动配置**

如果您喜欢手动配置，请将以下内容添加到您的 shell 启动文件：

**Fish** (`~/.config/fish/config.fish`):
```fish
# 加载 Claude Code 环境变量
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
# 加载 Claude Code 环境变量
if [ -f ~/.config/ccconfig/current.env ]; then
    set -a
    . ~/.config/ccconfig/current.env
    set +a
fi
```

**Zsh** (`~/.zshrc`):
```zsh
# 加载 Claude Code 环境变量
if [ -f ~/.config/ccconfig/current.env ]; then
    set -a
    . ~/.config/ccconfig/current.env
    set +a
fi
```

**PowerShell** (`$PROFILE`):
```powershell
# 加载 Claude Code 环境变量
$cconfigEnv = "$env:USERPROFILE\.config\ccconfig\current.env"
if (Test-Path $cconfigEnv) {
    Get-Content $cconfigEnv | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
}
```

**注意**: 手动配置允许您通过更改 `current.env` 动态切换配置文件，而 `-p/--permanent` 直接将值写入 shell 配置文件。

## 高级用法

### 更新现有配置

如果您需要修改已有配置，使用 `update` 命令：

```bash
# 交互式更新配置
ccconfig update work

# 工具会：
# 1. 显示当前值作为默认值
# 2. 提示输入每个字段
# 3. 按 Enter 保持当前值，或输入新值来更新
```

**示例：**
```bash
$ ccconfig update work
Updating configuration 'work'
Press Enter to keep the current value, or enter a new value to update

ANTHROPIC_BASE_URL [https://api.company.com]: https://new-api.company.com
ANTHROPIC_AUTH_TOKEN [sk-ant-api...]: <按 Enter 保持不变>
ANTHROPIC_API_KEY []: sk-new-key-123
ANTHROPIC_MODEL [claude-sonnet-4-5-20250929]: <按 Enter 保持不变>
Do you want to set ANTHROPIC_SMALL_FAST_MODEL? (y/N) [n]:

✓ Configuration 'work' updated
```

**注意：** 更新配置后，您可以：
- 使用 `ccconfig start work` 以更新后的配置启动 Claude Code
- 或使用 `ccconfig use work` 在当前 shell 中激活配置

### Shell 自动补全

ccconfig 支持命令、配置名称和选项的 shell 自动补全，让您更容易发现和使用命令。

**功能：**
- ✅ 命令补全 (list, add, update, use, remove 等)
- ✅ 配置名称补全（动态读取您的配置）
- ✅ 选项补全 (--permanent, --show-secret 等)
- ✅ 模式补全 (settings, env)
- ✅ 格式补全 (bash, zsh, fish 等)

**安装：**

```bash
# Bash
ccconfig completion bash >> ~/.bashrc
source ~/.bashrc

# Zsh
ccconfig completion zsh >> ~/.zshrc
source ~/.zshrc

# Fish
ccconfig completion fish > ~/.config/fish/completions/ccconfig.fish
# Fish 会在下次启动时自动加载

# PowerShell
ccconfig completion pwsh >> $PROFILE
# 重新加载配置: . $PROFILE
```

**PowerShell 注意事项：** 如果遇到 `$PROFILE` 不存在的错误，请先创建它：
```powershell
New-Item -Path $PROFILE -ItemType File -Force
ccconfig completion pwsh >> $PROFILE
. $PROFILE
```

**安装补全后的使用示例：**

```bash
# 输入 'ccconfig' 然后按 TAB 查看所有命令
ccconfig <TAB>
# 显示: list, add, update, use, remove, current, mode, env, edit, completion

# 输入 'ccconfig use' 然后按 TAB 查看所有配置
ccconfig use <TAB>
# 显示: work, personal, project1 等

# 输入 'ccconfig mode' 然后按 TAB
ccconfig mode <TAB>
# 显示: settings, env
```

### 快捷别名

```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
alias ccs='ccconfig'
alias ccs-use='ccconfig use'
alias ccs-list='ccconfig list'
alias ccs-current='ccconfig current'

# Fish (~/.config/fish/config.fish)
abbr ccs 'ccconfig'
abbr ccs-use 'ccconfig use'
abbr ccs-list 'ccconfig list'
```

### 项目级配置

对于特定项目，您可以导出 .env 文件：

```bash
# 导出到项目目录
cd my-project
ccconfig use project-config
ccconfig env dotenv > .env

# 使用项目配置
source .env
```

### 备份和同步

```bash
# 备份配置
cp ~/.config/ccconfig/profiles.json ~/backup/ccconfig-profiles.json

# 同步到新机器
scp ~/backup/ccconfig-profiles.json new-machine:~/.config/ccconfig/

# 或使用版本控制（注意安全！）
cd ~/.config/ccconfig
git init
echo "*.env" >> .gitignore
git add profiles.json
git commit -m "ccconfig profiles"
```

## 故障排除

### 配置未生效

**Settings 模式**:
1. **检查配置是否正确写入**: 
   ```bash
   ccconfig current
   # 查看【1】~/.claude/settings.json 部分
   ```
2. **直接验证 settings.json**:
   ```bash
   cat ~/.claude/settings.json | grep -A 5 '"env"'
   ```
3. **确认已重启 Claude Code**:
   - 完全退出 Claude Code（不只是关闭窗口）
   - 重新启动应用程序
4. **检查 `~/.claude/settings.json` 中的 `env` 字段**:
   ```json
   {
     "env": {
       "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
       "ANTHROPIC_AUTH_TOKEN": "sk-...",
       "ANTHROPIC_API_KEY": "sk-..."
     }
   }
   ```

**ENV 模式**:
1. **检查环境变量文件**: 
   ```bash
   cat ~/.config/ccconfig/current.env
   ```
2. **如果使用 --permanent 标志**:
   - 工具会显示警告并在修改文件前要求确认
   - 检查您的 shell 配置文件是否有 ccconfig 块:
     ```bash
     # For bash/zsh
     cat ~/.bashrc | grep -A 5 "ccconfig"
     # For fish
     cat ~/.config/fish/config.fish | grep -A 5 "ccconfig"
     ```
   - 重启 shell 或运行: `source ~/.bashrc`（或您的 shell 对应的命令）
   - 注意: 您也可以使用 `-p` 作为 `--permanent` 的简写
   - 要取消操作，在提示时输入 "no"
   
3. **如果使用手动配置或 eval 命令**:
   - 确认 Shell 配置正确: `cat ~/.bashrc | grep ccconfig`
   - 重启 Shell 或使用 `eval $(ccconfig env bash)`
   
4. **检查进程环境变量**: 
   ```bash
   ccconfig current
   # 查看【3】当前进程环境变量部分
   ```

### 切换模式后配置丢失

切换模式不会影响已保存的配置，只会改变配置的应用方式。切换后，您需要再次 `use`：

```bash
ccconfig mode env          # 切换到 env 模式
ccconfig use work          # 重新应用配置
```

### 文件权限问题

```bash
# 修复配置文件权限
chmod 600 ~/.config/ccconfig/profiles.json
chmod 600 ~/.claude/settings.json
chmod 600 ~/.config/ccconfig/current.env
```

## 安全考虑

1. **文件权限**: 工具会自动将配置文件设置为 600 权限（仅所有者可读写）

2. **敏感信息**:
   - API 密钥默认隐藏，使用 `--show-secret` 查看完整值
   - 不要将配置文件提交到公共仓库
   - 使用 `.gitignore` 排除敏感文件

3. **环境变量**: ENV 模式的环境变量会被子进程继承，请注意安全

4. **版本控制**: 如果对配置进行版本控制，请使用加密或私有仓库

## 许可证

MIT

