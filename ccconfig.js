#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Configuration file paths
const CONFIG_DIR = path.join(os.homedir(), '.config', 'ccconfig');
const PROFILES_FILE = path.join(CONFIG_DIR, 'profiles.json');
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const ENV_FILE = path.join(CONFIG_DIR, 'current.env');
const MODE_FILE = path.join(CONFIG_DIR, 'mode');

// Default modes
const MODE_SETTINGS = 'settings';  // Directly modify ~/.claude/settings.json
const MODE_ENV = 'env';            // Use environment variable files

let PACKAGE_VERSION = 'unknown';
try {
  const packageJson = require('./package.json');
  if (packageJson && typeof packageJson.version === 'string') {
    PACKAGE_VERSION = packageJson.version;
  }
} catch (_) {
  // Keep default 'unknown' when package.json is unavailable
}

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

/**
 * Load configuration file
 */
function loadProfiles() {
  try {
    if (!fs.existsSync(PROFILES_FILE)) {
      return null;
    }
    const content = fs.readFileSync(PROFILES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error: Unable to read configuration file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Save configuration file
 */
function saveProfiles(profiles) {
  try {
    ensureDir(CONFIG_DIR);
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');

    // Set file permissions to owner read/write only (600)
    if (os.platform() !== 'win32') {
      fs.chmodSync(PROFILES_FILE, 0o600);
    }
  } catch (error) {
    console.error(`Error: Unable to save configuration file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Load Claude Code settings.json
 */
function loadClaudeSettings() {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS)) {
      return {};
    }
    const content = fs.readFileSync(CLAUDE_SETTINGS, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(
        `Warning: Unable to read Claude settings.json: ${error.message}`);
    return {};
  }
}

/**
 * Save Claude Code settings.json
 */
function saveClaudeSettings(settings) {
  try {
    ensureDir(path.dirname(CLAUDE_SETTINGS));
    fs.writeFileSync(
        CLAUDE_SETTINGS, JSON.stringify(settings, null, 2), 'utf-8');

    if (os.platform() !== 'win32') {
      fs.chmodSync(CLAUDE_SETTINGS, 0o600);
    }
  } catch (error) {
    console.error(
        `Error: Unable to save Claude settings.json: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Get current mode
 */
function getMode() {
  try {
    if (fs.existsSync(MODE_FILE)) {
      const mode = fs.readFileSync(MODE_FILE, 'utf-8').trim();
      return mode === MODE_SETTINGS ? MODE_SETTINGS : MODE_ENV;
    }
  } catch (error) {
    // Ignore error, use default mode
  }
  return MODE_ENV;
}

/**
 * Set mode
 */
function setMode(mode) {
  try {
    ensureDir(CONFIG_DIR);
    fs.writeFileSync(MODE_FILE, mode, 'utf-8');
  } catch (error) {
    console.error(`Error: Unable to save mode settings: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Update Claude Code environment variable configuration (settings mode)
 */
function updateClaudeSettings(envVars) {
  const settings = loadClaudeSettings();

  if (!settings.env) {
    settings.env = {};
  }

  // Clear old related environment variables
  delete settings.env.ANTHROPIC_BASE_URL;
  delete settings.env.ANTHROPIC_AUTH_TOKEN;
  delete settings.env.ANTHROPIC_API_KEY;
  delete settings.env.ANTHROPIC_MODEL;
  delete settings.env.ANTHROPIC_SMALL_FAST_MODEL;

  // Set new environment variables
  Object.assign(settings.env, envVars);

  saveClaudeSettings(settings);
}

/**
 * Write environment variable file (env mode)
 */
function writeEnvFile(envVars) {
  try {
    ensureDir(CONFIG_DIR);
    const lines =
        Object.entries(envVars).map(([key, value]) => `${key}=${value}`);
    const content = lines.join('\n') + '\n';
    fs.writeFileSync(ENV_FILE, content, 'utf-8');

    if (os.platform() !== 'win32') {
      fs.chmodSync(ENV_FILE, 0o600);
    }
  } catch (error) {
    console.error(
        `Error: Unable to write environment variable file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Read environment variable file
 */
function readEnvFile() {
  try {
    if (!fs.existsSync(ENV_FILE)) {
      return null;
    }
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    const env = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1]] = match[2];
      }
    });
    return env;
  } catch (error) {
    return null;
  }
}

/**
 * Get currently available environment variables (automatically select source
 * based on mode)
 */
function getActiveEnvVars() {
  const mode = getMode();

  if (mode === MODE_ENV) {
    return readEnvFile();
  }

  const settings = loadClaudeSettings();
  if (settings && settings.env && Object.keys(settings.env).length > 0) {
    return settings.env;
  }

  const envVars = readEnvFile();
  if (envVars && Object.keys(envVars).length > 0) {
    return envVars;
  }

  return null;
}

/**
 * Get currently active configuration
 */
function getCurrentProfile() {
  const mode = getMode();
  const profiles = loadProfiles();

  if (!profiles) {
    return null;
  }

  let currentEnv;

  if (mode === MODE_SETTINGS) {
    const settings = loadClaudeSettings();
    if (!settings.env) return null;
    currentEnv = settings.env;
  } else {
    const env = readEnvFile();
    if (!env) return null;
    currentEnv = env;
  }

  // Compare environment variables for matches
  for (const [name, profile] of Object.entries(profiles.profiles)) {
    if (!profile.env) continue;

    const profileEnv = profile.env;
    let matched = true;

    // Check if ANTHROPIC_BASE_URL matches
    if (profileEnv.ANTHROPIC_BASE_URL !== currentEnv.ANTHROPIC_BASE_URL) {
      matched = false;
      continue;
    }

    // Check if authentication token matches (supports both fields)
    const profileAuth =
        profileEnv.ANTHROPIC_AUTH_TOKEN || profileEnv.ANTHROPIC_API_KEY;
    const currentAuth =
        currentEnv.ANTHROPIC_AUTH_TOKEN || currentEnv.ANTHROPIC_API_KEY;

    if (profileAuth !== currentAuth) {
      matched = false;
      continue;
    }

    if (matched) {
      return name;
    }
  }

  return null;
}

/**
 * Initialize configuration file (auto-called when needed)
 */
function initIfNeeded() {
  if (!fs.existsSync(PROFILES_FILE)) {
    const emptyProfiles = {profiles: {}};
    try {
      ensureDir(CONFIG_DIR);
      saveProfiles(emptyProfiles);
      console.log(`✓ Configuration file created: ${PROFILES_FILE}`);
      console.log('');
    } catch (error) {
      console.error(
          `Error: Unable to create configuration file: ${error.message}`);
      process.exit(1);
    }
  }
}

/**
 * List all configurations
 */
function list() {
  const profiles = loadProfiles();

  if (!profiles || !profiles.profiles ||
      Object.keys(profiles.profiles).length === 0) {
    console.log('No configurations found.');
    console.log('');
    console.log('Add your first configuration:');
    console.log('  ccconfig add work');
    console.log('');
    console.log(
        'The command will guide you through configuration step by step.');
    return;
  }

  const currentProfile = getCurrentProfile();

  console.log('Available configurations:\n');

  for (const [name, profile] of Object.entries(profiles.profiles)) {
    const isCurrent = name === currentProfile ? ' ← current' : '';
    console.log(`  ${name}${isCurrent}`);
    if (profile.env && profile.env.ANTHROPIC_BASE_URL) {
      console.log(`    URL: ${profile.env.ANTHROPIC_BASE_URL}`);
    }
    if (profile.env && profile.env.ANTHROPIC_MODEL) {
      console.log(`    Model: ${profile.env.ANTHROPIC_MODEL}`);
    }
    if (profile.env && profile.env.ANTHROPIC_SMALL_FAST_MODEL) {
      console.log(`    Small Fast Model: ${profile.env.ANTHROPIC_SMALL_FAST_MODEL}`);
    }
    console.log('');
  }

  if (currentProfile) {
    console.log(`Currently active: ${currentProfile}`);
  } else {
    const settings = loadClaudeSettings();
    if (settings.env && settings.env.ANTHROPIC_BASE_URL) {
      console.log(
          'Currently using custom configuration (not in configuration list)');
      console.log(`  URL: ${settings.env.ANTHROPIC_BASE_URL}`);
    } else {
      console.log('Claude Code environment variables not configured yet');
    }
  }
}

/**
 * Add new configuration
 */
async function add(name) {
  // Auto-initialize if needed
  initIfNeeded();

  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

  if (!isInteractive) {
    console.error('Error: Interactive mode required for adding configurations');
    console.error('This command must be run in an interactive terminal');
    process.exit(1);
  }

  let rl = null;

  const askQuestion = (question, defaultValue = '') => {
    if (!rl) {
      rl = readline.createInterface(
          {input: process.stdin, output: process.stdout});
    }
    return new Promise(resolve => {
      const suffix = defaultValue ? ` (${defaultValue})` : '';
      rl.question(`${question}${suffix}: `, answer => {
        const trimmed = answer.trim();
        resolve(trimmed ? trimmed : defaultValue.trim());
      });
    });
  };

  let baseUrl, authToken, apiKey, model, smallFastModel;
  let profiles;

  try {
    if (!name) {
      name = await askQuestion('Please enter configuration name (e.g., work)');
    }

    if (!name) {
      console.error('Error: Configuration name cannot be empty');
      process.exit(1);
    }

    // Check if configuration already exists before asking for details
    profiles = loadProfiles() || {profiles: {}};

    if (profiles.profiles[name]) {
      console.error(`Error: Configuration '${name}' already exists`);
      console.error('To update, please edit the configuration file directly');
      process.exit(1);
    }

    baseUrl = await askQuestion(
        'Please enter ANTHROPIC_BASE_URL (press Enter for default)',
        'https://api.anthropic.com');

    authToken =
        await askQuestion('Please enter ANTHROPIC_AUTH_TOKEN (press Enter to set as empty)');

    apiKey = await askQuestion('Please enter ANTHROPIC_API_KEY (press Enter to set as empty)');

    model = await askQuestion('Please enter ANTHROPIC_MODEL (press Enter to skip)');

    smallFastModel = await askQuestion('Please enter ANTHROPIC_SMALL_FAST_MODEL (press Enter to skip)');
  } finally {
    if (rl) {
      rl.close();
    }
  }

  const envVars = {
    ANTHROPIC_BASE_URL: baseUrl || '',
    ANTHROPIC_AUTH_TOKEN: authToken || '',
    ANTHROPIC_API_KEY: apiKey || ''
  };

  // Add optional model variables if provided
  if (model) {
    envVars.ANTHROPIC_MODEL = model;
  }
  if (smallFastModel) {
    envVars.ANTHROPIC_SMALL_FAST_MODEL = smallFastModel;
  }

  profiles.profiles[name] = {env: envVars};

  saveProfiles(profiles);
  console.log(`✓ Configuration '${name}' added`);
  console.log('');
  console.log('Run the following command to activate:');
  console.log(`  ccconfig use ${name}`);
  console.log('');
  console.log('Saved environment variables:');
  const safePrint = (key, value, mask = true) => {
    if (!value) {
      console.log(`  ${key}: (not set)`);
      return;
    }
    if (!mask) {
      console.log(`  ${key}: ${value}`);
      return;
    }
    const masked = value.length > 20 ? value.substring(0, 20) + '...' : value;
    console.log(`  ${key}: ${masked}`);
  };
  safePrint('ANTHROPIC_BASE_URL', envVars.ANTHROPIC_BASE_URL, false);
  safePrint('ANTHROPIC_AUTH_TOKEN', envVars.ANTHROPIC_AUTH_TOKEN);
  safePrint('ANTHROPIC_API_KEY', envVars.ANTHROPIC_API_KEY);
  if (envVars.ANTHROPIC_MODEL) {
    safePrint('ANTHROPIC_MODEL', envVars.ANTHROPIC_MODEL, false);
  }
  if (envVars.ANTHROPIC_SMALL_FAST_MODEL) {
    safePrint('ANTHROPIC_SMALL_FAST_MODEL', envVars.ANTHROPIC_SMALL_FAST_MODEL, false);
  }
  console.log('');
  console.log('This information has been saved to:');
  console.log(`  ${PROFILES_FILE}`);
  console.log(
      'You can edit this file directly to further customize the profile:');
  console.log(`  vim ${PROFILES_FILE}`);
  console.log('Or run ccconfig edit to open it with your preferred editor');
}

/**
 * Update existing configuration
 */
async function update(name) {
  // Auto-initialize if needed
  initIfNeeded();

  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

  if (!isInteractive) {
    console.error('Error: Interactive mode required for updating configurations');
    console.error('This command must be run in an interactive terminal');
    process.exit(1);
  }

  let rl = null;

  const askQuestion = (question, defaultValue = '') => {
    if (!rl) {
      rl = readline.createInterface(
          {input: process.stdin, output: process.stdout});
    }
    return new Promise(resolve => {
      const suffix = defaultValue ? ` [${defaultValue}]` : '';
      rl.question(`${question}${suffix}: `, answer => {
        const trimmed = answer.trim();
        resolve(trimmed ? trimmed : defaultValue);
      });
    });
  };

  let baseUrl, authToken, apiKey, model, smallFastModel;
  let profiles;

  try {
    if (!name) {
      name = await askQuestion('Please enter configuration name to update');
    }

    if (!name) {
      console.error('Error: Configuration name cannot be empty');
      process.exit(1);
    }

    // Check if configuration exists
    profiles = loadProfiles() || {profiles: {}};

    if (!profiles.profiles[name]) {
      console.error(`Error: Configuration '${name}' does not exist`);
      console.error('Run ccconfig list to see available configurations');
      console.error(`Or use 'ccconfig add ${name}' to create a new configuration`);
      process.exit(1);
    }

    const existingProfile = profiles.profiles[name];
    const existingEnv = existingProfile.env || {};

    console.log(`Updating configuration '${name}'`);
    console.log('Press Enter to keep current value/default, or enter new value to update');
    console.log('');

    baseUrl = await askQuestion(
        'ANTHROPIC_BASE_URL (press Enter to keep current/default)',
        existingEnv.ANTHROPIC_BASE_URL || 'https://api.anthropic.com');

    authToken =
        await askQuestion('ANTHROPIC_AUTH_TOKEN (press Enter to keep current/set empty)', existingEnv.ANTHROPIC_AUTH_TOKEN || '');

    apiKey = await askQuestion('ANTHROPIC_API_KEY (press Enter to keep current/set empty)', existingEnv.ANTHROPIC_API_KEY || '');

    model = await askQuestion('ANTHROPIC_MODEL (press Enter to skip/keep current)', existingEnv.ANTHROPIC_MODEL || '');

    smallFastModel = await askQuestion('ANTHROPIC_SMALL_FAST_MODEL (press Enter to skip/keep current)', existingEnv.ANTHROPIC_SMALL_FAST_MODEL || '');
  } finally {
    if (rl) {
      rl.close();
    }
  }

  const envVars = {
    ANTHROPIC_BASE_URL: baseUrl || '',
    ANTHROPIC_AUTH_TOKEN: authToken || '',
    ANTHROPIC_API_KEY: apiKey || ''
  };

  // Add optional model variables if provided
  if (model) {
    envVars.ANTHROPIC_MODEL = model;
  }
  if (smallFastModel) {
    envVars.ANTHROPIC_SMALL_FAST_MODEL = smallFastModel;
  }

  profiles.profiles[name] = {env: envVars};

  saveProfiles(profiles);
  console.log(`✓ Configuration '${name}' updated`);
  console.log('');
  console.log('Updated environment variables:');
  const safePrint = (key, value, mask = true) => {
    if (!value) {
      console.log(`  ${key}: (not set)`);
      return;
    }
    if (!mask) {
      console.log(`  ${key}: ${value}`);
      return;
    }
    const masked = value.length > 20 ? value.substring(0, 20) + '...' : value;
    console.log(`  ${key}: ${masked}`);
  };
  safePrint('ANTHROPIC_BASE_URL', envVars.ANTHROPIC_BASE_URL, false);
  safePrint('ANTHROPIC_AUTH_TOKEN', envVars.ANTHROPIC_AUTH_TOKEN);
  safePrint('ANTHROPIC_API_KEY', envVars.ANTHROPIC_API_KEY);
  if (envVars.ANTHROPIC_MODEL) {
    safePrint('ANTHROPIC_MODEL', envVars.ANTHROPIC_MODEL, false);
  }
  if (envVars.ANTHROPIC_SMALL_FAST_MODEL) {
    safePrint('ANTHROPIC_SMALL_FAST_MODEL', envVars.ANTHROPIC_SMALL_FAST_MODEL, false);
  }
  console.log('');
  console.log('Run the following command to activate:');
  console.log(`  ccconfig use ${name}`);
}

/**
 * Remove configuration
 */
function remove(name) {
  if (!name) {
    console.error('Error: Missing configuration name');
    console.error('Usage: ccconfig remove <name>');
    process.exit(1);
  }

  const profiles = loadProfiles();

  if (!profiles) {
    console.error('Error: Configuration file does not exist');
    process.exit(1);
  }

  if (!profiles.profiles[name]) {
    console.error(`Error: Configuration '${name}' does not exist`);
    process.exit(1);
  }

  delete profiles.profiles[name];
  saveProfiles(profiles);
  console.log(`✓ Configuration '${name}' removed`);
}

/**
 * Detect current shell and return recommended activation command
 */
function detectShellCommand() {
  const shellPath = (process.env.SHELL || '').toLowerCase();

  if (process.env.FISH_VERSION || shellPath.includes('fish')) {
    return {shell: 'fish', command: 'ccconfig env fish | source'};
  }

  if (process.env.ZSH_NAME || process.env.ZSH_VERSION ||
      shellPath.includes('zsh')) {
    return {shell: 'zsh', command: 'eval $(ccconfig env bash)'};
  }

  if (process.env.POWERSHELL_DISTRIBUTION_CHANNEL ||
      shellPath.includes('pwsh') || shellPath.includes('powershell')) {
    return {shell: 'PowerShell', command: 'ccconfig env pwsh | iex'};
  }

  if (shellPath.includes('bash')) {
    return {shell: 'bash', command: 'eval $(ccconfig env bash)'};
  }

  if (process.platform === 'win32') {
    const comSpec = (process.env.ComSpec || '').toLowerCase();
    if (comSpec.includes('powershell')) {
      return {shell: 'PowerShell', command: 'ccconfig env pwsh | iex'};
    }
  }

  return {shell: null, command: null};
}

function escapePosix(value) {
  const str = value == null ? '' : String(value);
  return `'${str.replace(/'/g, `'"'"'`)}'`;
}

function escapeFish(value) {
  const str = value == null ? '' : String(value);
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
}

function escapePwsh(value) {
  const str = value == null ? '' : String(value);
  return `'${str.replace(/'/g, `''`)}'`;
}

/**
 * Detect shell type and config file path
 */
function detectShellConfig() {
  const shellPath = (process.env.SHELL || '').toLowerCase();
  const homeDir = os.homedir();

  if (process.env.FISH_VERSION || shellPath.includes('fish')) {
    const configPath = path.join(homeDir, '.config', 'fish', 'config.fish');
    return {shell: 'fish', configPath, detected: true};
  }

  if (process.env.ZSH_NAME || process.env.ZSH_VERSION ||
      shellPath.includes('zsh')) {
    const configPath = path.join(homeDir, '.zshrc');
    return {shell: 'zsh', configPath, detected: true};
  }

  if (shellPath.includes('bash')) {
    if (process.platform === 'darwin') {
      const bashProfile = path.join(homeDir, '.bash_profile');
      const bashrc = path.join(homeDir, '.bashrc');
      const configPath = fs.existsSync(bashProfile) || !fs.existsSync(bashrc) ?
          bashProfile :
          bashrc;
      return {shell: 'bash', configPath, detected: true};
    }
    const configPath = path.join(homeDir, '.bashrc');
    return {shell: 'bash', configPath, detected: true};
  }

  if (process.env.POWERSHELL_DISTRIBUTION_CHANNEL ||
      shellPath.includes('pwsh') || shellPath.includes('powershell')) {
    // PowerShell profile path varies by OS
    const configPath = process.platform === 'win32' ?
        path.join(
            process.env.USERPROFILE || homeDir, 'Documents', 'PowerShell',
            'Microsoft.PowerShell_profile.ps1') :
        path.join(homeDir, '.config', 'powershell', 'profile.ps1');
    return {shell: 'powershell', configPath, detected: true};
  }

  return {shell: null, configPath: null, detected: false};
}

/**
 * Write environment variables permanently to shell config file
 */
async function writePermanentEnv(envVars) {
  const shellConfig = detectShellConfig();

  if (!shellConfig.detected) {
    console.error('Error: Unable to detect shell type');
    console.error('Supported shells: bash, zsh, fish, powershell');
    console.error(`Current SHELL: ${process.env.SHELL || '(not set)'}`);
    process.exit(1);
  }

  const {shell, configPath} = shellConfig;
  const marker = '# >>> ccconfig >>>';
  const markerEnd = '# <<< ccconfig <<<';

  // Generate environment variable lines
  let envBlock = '';
  switch (shell) {
    case 'fish':
      envBlock = `${marker}\n`;
      for (const [key, value] of Object.entries(envVars)) {
        envBlock += `set -gx ${key} "${escapeFish(value)}"\n`;
      }
      envBlock += `${markerEnd}\n`;
      break;

    case 'bash':
    case 'zsh':
      envBlock = `${marker}\n`;
      for (const [key, value] of Object.entries(envVars)) {
        envBlock += `export ${key}=${escapePosix(value)}\n`;
      }
      envBlock += `${markerEnd}\n`;
      break;

    case 'powershell':
      envBlock = `${marker}\n`;
      for (const [key, value] of Object.entries(envVars)) {
        envBlock += `$env:${key}=${escapePwsh(value)}\n`;
      }
      envBlock += `${markerEnd}\n`;
      break;
  }

  // Display warning and confirmation
  console.log('');
  console.log('⚠️  WARNING: This will modify your shell configuration file');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Target file: ${configPath}`);
  console.log('');
  console.log('The following block will be added/updated:');
  console.log('───────────────────────────────────────────');
  console.log(envBlock.trim());
  console.log('───────────────────────────────────────────');
  console.log('');
  console.log('What this does:');
  console.log('  • Adds environment variables to your shell startup file');
  console.log('  • Uses markers to identify ccconfig-managed block');
  console.log('  • Existing ccconfig block will be replaced if present');
  console.log('  • Other content in the file will NOT be modified');
  console.log('');
  console.log('After this change:');
  console.log(
      '  • These environment variables will load automatically on shell startup');
  console.log('  • You can switch profiles by running this command again');
  console.log('  • To remove, manually delete the block between the markers');
  console.log('');

  // Ask for confirmation
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

  if (!isInteractive) {
    console.error('Error: Cannot run in non-interactive mode');
    console.error('The --permanent flag requires user confirmation');
    console.error('Please run this command in an interactive terminal');
    process.exit(1);
  }

  const rl =
      readline.createInterface({input: process.stdin, output: process.stdout});

  const confirmed = await new Promise(resolve => {
    rl.question('Do you want to proceed? (yes/no): ', answer => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'yes' || normalized === 'y');
    });
  });

  if (!confirmed) {
    console.log('');
    console.log('Operation cancelled.');
    console.log('');
    console.log('Alternative: Use temporary mode without --permanent flag:');
    console.log('  1. Run: ccconfig use <profile>');
    console.log(
        '  2. Apply: eval $(ccconfig env bash)  # or equivalent for your shell');
    return;
  }

  console.log('');

  try {
    // Ensure config directory exists
    ensureDir(path.dirname(configPath));

    // Read existing config file
    let content = '';
    if (fs.existsSync(configPath)) {
      content = fs.readFileSync(configPath, 'utf-8');
    }

    // Check if ccconfig block already exists
    const hasBlock = content.includes(marker);

    // Update content
    if (hasBlock) {
      // Replace existing block
      const regex = new RegExp(
          `${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${
              markerEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
          'g');
      content = content.replace(regex, envBlock);
    } else {
      // Append new block
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += '\n' + envBlock;
    }

    // Write back to config file
    fs.writeFileSync(configPath, content, 'utf-8');

    console.log(`✓ Environment variables written to ${shell} config file`);
    console.log(`  Config file: ${configPath}`);
    console.log('');
    console.log('To apply immediately, run:');
    let applyCommand = '';
    switch (shell) {
      case 'fish':
        applyCommand = `source "${escapeFish(configPath)}"`;
        break;
      case 'bash':
      case 'zsh':
        applyCommand = `source ${escapePosix(configPath)}`;
        break;
      case 'powershell':
        applyCommand = `. ${escapePwsh(configPath)}`;
        break;
      default:
        applyCommand = `source ${configPath}`;
        break;
    }
    console.log(`  ${applyCommand}`);
    console.log('');
    console.log('Or restart your shell');

  } catch (error) {
    console.error('');
    console.error(
        `Error: Unable to write to shell config file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Switch configuration
 */
async function use(name, options = {}) {
  const profiles = loadProfiles();

  if (!profiles || !profiles.profiles ||
      Object.keys(profiles.profiles).length === 0) {
    console.error('Error: No configurations found');
    console.error('Please add a configuration first: ccconfig add <name>');
    process.exit(1);
  }

  if (!profiles.profiles[name]) {
    console.error(`Error: Configuration '${name}' does not exist`);
    console.error('Run ccconfig list to see available configurations');
    process.exit(1);
  }

  const profile = profiles.profiles[name];

  if (!profile.env || Object.keys(profile.env).length === 0) {
    console.error(
        `Error: Configuration '${name}' has empty environment variables`);
    console.error('Please edit the configuration file to add env field');
    process.exit(1);
  }

  const mode = getMode();
  const permanent = options.permanent || false;

  if (mode === MODE_SETTINGS) {
    // Settings mode: directly modify ~/.claude/settings.json
    updateClaudeSettings(profile.env);

    console.log(`✓ Switched to configuration: ${name} (settings mode)`);
    console.log(`  Environment variables:`);
    for (const [key, value] of Object.entries(profile.env)) {
      const displayValue =
          value.length > 20 ? value.substring(0, 20) + '...' : value;
      console.log(`    ${key}: ${displayValue}`);
    }
    console.log('');
    console.log('Configuration written to ~/.claude/settings.json');
    console.log('Restart Claude Code to make configuration take effect');

    if (permanent) {
      console.log('');
      console.log(
          'Note: --permanent flag is ignored in settings mode (settings.json is already permanent)');
    }
  } else {
    // Env mode: write to environment variable file
    writeEnvFile(profile.env);

    console.log(`✓ Switched to configuration: ${name} (env mode)`);
    console.log(`  Environment variables:`);
    for (const [key, value] of Object.entries(profile.env)) {
      const displayValue =
          value.length > 20 ? value.substring(0, 20) + '...' : value;
      console.log(`    ${key}: ${displayValue}`);
    }
    console.log('');
    console.log(`Environment variable file updated: ${ENV_FILE}`);

    if (permanent) {
      console.log('');
      console.log(
          'Writing environment variables permanently to shell config...');
      console.log('');
      await writePermanentEnv(profile.env);
    } else {
      console.log('');
      const shellSuggestion = detectShellCommand();
      const applyCommands = [
        {command: 'eval $(ccconfig env bash)', note: '# Bash/Zsh'},
        {command: 'ccconfig env fish | source', note: '# Fish'},
        {command: 'ccconfig env pwsh | iex', note: '# PowerShell'}
      ];

      console.log('Apply immediately in current Shell (optional):');

      if (shellSuggestion.command) {
        console.log(`  ${shellSuggestion.command}  # Detected ${
            shellSuggestion.shell}`);

        const normalizedSuggestion =
            shellSuggestion.command.replace(/\s+/g, ' ').trim();
        for (const item of applyCommands) {
          const normalizedCommand = item.command.replace(/\s+/g, ' ').trim();
          if (normalizedCommand === normalizedSuggestion) {
            item.skip = true;
          }
        }
      }

      for (const item of applyCommands) {
        if (item.skip) continue;
        console.log(`  ${item.command} ${item.note}`);
      }
      console.log('');
      console.log('Or restart Shell to auto-load');
      console.log('');
      console.log(
          'Tip: Use -p/--permanent flag to write directly to shell config:');
      console.log(`  ccconfig use ${name} --permanent`);
    }
  }
}

/**
 * Display current configuration
 */
function current(showSecret = false) {
  const currentMode = getMode();
  const settings = loadClaudeSettings();
  const envFile = readEnvFile();
  const processEnv = {
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    ANTHROPIC_SMALL_FAST_MODEL: process.env.ANTHROPIC_SMALL_FAST_MODEL
  };
  const currentProfile = getCurrentProfile();

  console.log('═══════════════════════════════════════════');
  console.log('Claude Code Configuration Status');
  console.log('═══════════════════════════════════════════');
  console.log('');

  // Display current mode
  console.log(`Current Mode: ${currentMode}`);
  if (currentProfile) {
    console.log(`Active Configuration: ${currentProfile}`);
  } else {
    console.log('Active Configuration: (no matching configuration)');
  }
  console.log('');

  // Display settings.json configuration
  console.log('【1】~/.claude/settings.json:');
  if (settings.env &&
      (settings.env.ANTHROPIC_BASE_URL || settings.env.ANTHROPIC_AUTH_TOKEN)) {
    const baseUrl = settings.env.ANTHROPIC_BASE_URL || '(not set)';
    const authToken = settings.env.ANTHROPIC_AUTH_TOKEN || '(not set)';
    const maskedToken = (authToken === '(not set)' || showSecret) ?
        authToken :
        authToken.substring(0, 20) + '...';

    console.log(`  ANTHROPIC_BASE_URL:   ${baseUrl}`);
    console.log(`  ANTHROPIC_AUTH_TOKEN: ${maskedToken}`);
    if (settings.env.ANTHROPIC_MODEL) {
      console.log(`  ANTHROPIC_MODEL:      ${settings.env.ANTHROPIC_MODEL}`);
    }
    if (settings.env.ANTHROPIC_SMALL_FAST_MODEL) {
      console.log(`  ANTHROPIC_SMALL_FAST_MODEL: ${settings.env.ANTHROPIC_SMALL_FAST_MODEL}`);
    }
  } else {
    console.log('  (not configured)');
  }
  console.log('');

  // Display environment variable file configuration
  console.log(`【2】Environment Variables File (${ENV_FILE}):`);
  if (envFile &&
      (envFile.ANTHROPIC_BASE_URL || envFile.ANTHROPIC_AUTH_TOKEN ||
       envFile.ANTHROPIC_API_KEY)) {
    const baseUrl = envFile.ANTHROPIC_BASE_URL || '(not set)';
    const authToken = envFile.ANTHROPIC_AUTH_TOKEN ||
        envFile.ANTHROPIC_API_KEY || '(not set)';
    const maskedToken = (authToken === '(not set)' || showSecret) ?
        authToken :
        authToken.substring(0, 20) + '...';

    console.log(`  ANTHROPIC_BASE_URL:   ${baseUrl}`);
    console.log(`  ANTHROPIC_AUTH_TOKEN: ${maskedToken}`);
    if (envFile.ANTHROPIC_MODEL) {
      console.log(`  ANTHROPIC_MODEL:      ${envFile.ANTHROPIC_MODEL}`);
    }
    if (envFile.ANTHROPIC_SMALL_FAST_MODEL) {
      console.log(`  ANTHROPIC_SMALL_FAST_MODEL: ${envFile.ANTHROPIC_SMALL_FAST_MODEL}`);
    }
  } else {
    console.log('  (not configured)');
  }
  console.log('');

  // Display current process environment variables
  console.log('【3】Current Process Environment Variables:');
  if (processEnv.ANTHROPIC_BASE_URL || processEnv.ANTHROPIC_AUTH_TOKEN ||
      processEnv.ANTHROPIC_API_KEY) {
    const baseUrl = processEnv.ANTHROPIC_BASE_URL || '(not set)';
    const authToken = processEnv.ANTHROPIC_AUTH_TOKEN ||
        processEnv.ANTHROPIC_API_KEY || '(not set)';
    const maskedToken = (authToken === '(not set)' || showSecret) ?
        authToken :
        authToken.substring(0, 20) + '...';

    console.log(`  ANTHROPIC_BASE_URL:   ${baseUrl}`);
    console.log(`  ANTHROPIC_AUTH_TOKEN: ${maskedToken}`);
    if (processEnv.ANTHROPIC_MODEL) {
      console.log(`  ANTHROPIC_MODEL:      ${processEnv.ANTHROPIC_MODEL}`);
    }
    if (processEnv.ANTHROPIC_SMALL_FAST_MODEL) {
      console.log(`  ANTHROPIC_SMALL_FAST_MODEL: ${processEnv.ANTHROPIC_SMALL_FAST_MODEL}`);
    }
  } else {
    console.log('  (not set)');
  }
  console.log('');

  // Display notes
  console.log('───────────────────────────────────────────');
  console.log('Notes:');
  console.log('  • Settings mode: Claude Code reads from 【1】');
  console.log('  • ENV mode: Claude Code reads from 【3】(loaded from 【2】)');
  if (!showSecret) {
    console.log('');
    console.log('Use -s/--show-secret to display full token');
  }
  console.log('═══════════════════════════════════════════');
}

/**
 * Show configuration file path
 */
function edit() {
  if (!fs.existsSync(PROFILES_FILE)) {
    console.error('Error: Configuration file does not exist');
    console.error('Please add a configuration first: ccconfig add <name>');
    process.exit(1);
  }

  const editor = process.env.EDITOR || process.env.VISUAL || 'vim';

  console.log('Configuration file path:');
  console.log(`  ${PROFILES_FILE}`);
  console.log('');
  console.log('Open it with your preferred editor, for example:');
  console.log(`  ${editor} ${PROFILES_FILE}`);
}

/**
 * Switch/view mode
 */
function mode(newMode) {
  if (!newMode) {
    // Display current mode
    const currentMode = getMode();
    console.log(`Current mode: ${currentMode}`);
    console.log('');
    if (currentMode === MODE_SETTINGS) {
      console.log('SETTINGS mode:');
      console.log('  - Directly modify ~/.claude/settings.json');
      console.log(
          '  - Writes environment variables into settings.json env field');
      console.log('  - No Shell configuration needed');
      console.log('  - Restart Claude Code to take effect');
      console.log('');
      console.log('  How it works:');
      console.log('    1. Run: ccconfig use <profile>');
      console.log('    2. Settings written to ~/.claude/settings.json');
      console.log('    3. Restart Claude Code to apply changes');
    } else {
      console.log('ENV mode (default):');
      console.log('  - Use environment variable files');
      console.log('  - Need to configure Shell loading script');
      console.log('  - Cross-Shell configuration sharing');
      console.log('  - No restart needed (instant apply)');
      console.log('');
      console.log('  How it works:');
      console.log('    1. Run: ccconfig use <profile>');
      console.log('    2. Writes to ~/.config/ccconfig/current.env');
      console.log('    3. Shell loads on startup or eval command');
    }
    console.log('');
    console.log('Switch modes:');
    console.log('  ccconfig mode settings');
    console.log('  ccconfig mode env');
    return;
  }

  if (newMode !== MODE_SETTINGS && newMode !== MODE_ENV) {
    console.error(`Error: Invalid mode '${newMode}'`);
    console.error(`Available modes: ${MODE_SETTINGS}, ${MODE_ENV}`);
    process.exit(1);
  }

  const oldMode = getMode();
  setMode(newMode);

  console.log(`✓ Mode switched: ${oldMode} -> ${newMode}`);
  console.log('');

  if (newMode === MODE_SETTINGS) {
    console.log('SETTINGS mode enabled');
    console.log(
        '  Next use command will directly modify ~/.claude/settings.json');
  } else {
    console.log('ENV mode enabled');
    console.log('  Next use command will write to environment variable file');
    console.log('  Please ensure Shell loading script is configured');
  }
}

/**
 * Output environment variables (for source)
 */
function env(format = 'bash') {
  const envVars = getActiveEnvVars();

  if (!envVars || Object.keys(envVars).length === 0) {
    console.error(
        'Error: No available environment variable configuration found');
    console.error(
        'Please run ccconfig use <name> to select a configuration first');
    process.exit(1);
  }

  // Output all environment variables
  switch (format) {
    case 'fish':
      for (const [key, value] of Object.entries(envVars)) {
        console.log(`set -gx ${key} "${escapeFish(value)}"`);
      }
      break;
    case 'bash':
    case 'zsh':
    case 'sh':
      for (const [key, value] of Object.entries(envVars)) {
        console.log(`export ${key}=${escapePosix(value)}`);
      }
      break;
    case 'powershell':
    case 'pwsh':
      for (const [key, value] of Object.entries(envVars)) {
        console.log(`$env:${key}=${escapePwsh(value)}`);
      }
      break;
    case 'dotenv':
      for (const [key, value] of Object.entries(envVars)) {
        const renderedValue = value == null ? '' : String(value);
        console.log(`${key}=${renderedValue}`);
      }
      break;
    default:
      console.error(`Error: Unsupported format: ${format}`);
      console.error(
          'Supported formats: fish, bash, zsh, sh, powershell, pwsh, dotenv');
      process.exit(1);
  }
}

/**
 * Generate shell completion script
 */
function completion(shell) {
  if (!shell) {
    console.error('Error: Missing shell type');
    console.error('Usage: ccconfig completion <bash|zsh|fish|powershell|pwsh>');
    console.error('');
    console.error('To install:');
    console.error('  Bash:       ccconfig completion bash >> ~/.bashrc');
    console.error('  Zsh:        ccconfig completion zsh >> ~/.zshrc');
    console.error('  Fish:       ccconfig completion fish > ~/.config/fish/completions/ccconfig.fish');
    console.error('  PowerShell: ccconfig completion pwsh >> $PROFILE');
    process.exit(1);
  }

  const commands = 'list ls add update use remove rm current mode env edit';

  switch (shell) {
    case 'bash':
      console.log(`# ccconfig bash completion
_ccconfig_completions() {
  local cur prev commands profiles
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${commands}"

  # Get available profiles
  if [ -f ~/.config/ccconfig/profiles.json ]; then
    profiles=$(node -e "try { const data = require(process.env.HOME + '/.config/ccconfig/profiles.json'); console.log(Object.keys(data.profiles || {}).join(' ')); } catch(e) { }" 2>/dev/null)
  fi

  case "\${COMP_CWORD}" in
    1)
      COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
      ;;
    2)
      case "\${prev}" in
        use|update|remove|rm)
          COMPREPLY=( $(compgen -W "\${profiles}" -- \${cur}) )
          ;;
        mode)
          COMPREPLY=( $(compgen -W "settings env" -- \${cur}) )
          ;;
        env)
          COMPREPLY=( $(compgen -W "bash zsh fish sh powershell pwsh dotenv" -- \${cur}) )
          ;;
      esac
      ;;
    3)
      case "\${COMP_WORDS[1]}" in
        use)
          COMPREPLY=( $(compgen -W "--permanent -p" -- \${cur}) )
          ;;
        current)
          COMPREPLY=( $(compgen -W "--show-secret -s" -- \${cur}) )
          ;;
      esac
      ;;
  esac
}

complete -F _ccconfig_completions ccconfig
`);
      break;

    case 'zsh':
      console.log(`# ccconfig zsh completion
_ccconfig() {
  local -a commands profiles modes formats
  commands=(
    'list:List all configurations'
    'ls:List all configurations'
    'add:Add new configuration'
    'update:Update existing configuration'
    'use:Switch to specified configuration'
    'remove:Remove configuration'
    'rm:Remove configuration'
    'current:Display current configuration'
    'mode:View or switch mode'
    'env:Output environment variables'
    'edit:Show configuration file location'
  )

  modes=('settings' 'env')
  formats=('bash' 'zsh' 'fish' 'sh' 'powershell' 'pwsh' 'dotenv')

  # Get available profiles
  if [ -f ~/.config/ccconfig/profiles.json ]; then
    profiles=($(node -e "try { const data = require(process.env.HOME + '/.config/ccconfig/profiles.json'); console.log(Object.keys(data.profiles || {}).join(' ')); } catch(e) { }" 2>/dev/null))
  fi

  case $CURRENT in
    2)
      _describe 'command' commands
      ;;
    3)
      case $words[2] in
        use|update|remove|rm)
          _describe 'profile' profiles
          ;;
        mode)
          _describe 'mode' modes
          ;;
        env)
          _describe 'format' formats
          ;;
      esac
      ;;
    4)
      case $words[2] in
        use)
          _arguments '-p[Write permanently to shell config]' '--permanent[Write permanently to shell config]'
          ;;
        current)
          _arguments '-s[Show full token]' '--show-secret[Show full token]'
          ;;
      esac
      ;;
  esac
}

compdef _ccconfig ccconfig
`);
      break;

    case 'fish':
      console.log(`# ccconfig fish completion

# Commands
complete -c ccconfig -f -n "__fish_use_subcommand" -a "list" -d "List all configurations"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "ls" -d "List all configurations"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "add" -d "Add new configuration"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "update" -d "Update existing configuration"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "use" -d "Switch to specified configuration"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "remove" -d "Remove configuration"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "rm" -d "Remove configuration"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "current" -d "Display current configuration"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "mode" -d "View or switch mode"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "env" -d "Output environment variables"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "edit" -d "Show configuration file location"

# Get profile names dynamically
function __ccconfig_profiles
  if test -f ~/.config/ccconfig/profiles.json
    node -e "try { const data = require(process.env.HOME + '/.config/ccconfig/profiles.json'); Object.keys(data.profiles || {}).forEach(k => console.log(k)); } catch(e) { }" 2>/dev/null
  end
end

# Profile name completion for use, update, remove
complete -c ccconfig -f -n "__fish_seen_subcommand_from use update remove rm" -a "(__ccconfig_profiles)"

# Mode options
complete -c ccconfig -f -n "__fish_seen_subcommand_from mode" -a "settings env"

# Env format options
complete -c ccconfig -f -n "__fish_seen_subcommand_from env" -a "bash zsh fish sh powershell pwsh dotenv"

# Flags for use command
complete -c ccconfig -f -n "__fish_seen_subcommand_from use" -s p -l permanent -d "Write permanently to shell config"

# Flags for current command
complete -c ccconfig -f -n "__fish_seen_subcommand_from current" -s s -l show-secret -d "Show full token"

# Global flags
complete -c ccconfig -f -s h -l help -d "Display help information"
complete -c ccconfig -f -s V -l version -d "Display version information"
`);
      break;

    case 'powershell':
    case 'pwsh':
      console.log(`# ccconfig PowerShell completion

# Get available profiles
function Get-CconfigProfiles {
    $profilesPath = Join-Path $env:USERPROFILE ".config\\ccconfig\\profiles.json"
    if (Test-Path $profilesPath) {
        try {
            $profiles = Get-Content $profilesPath | ConvertFrom-Json
            return $profiles.profiles.PSObject.Properties.Name
        } catch {
            return @()
        }
    }
    return @()
}

# Register argument completer for ccconfig
Register-ArgumentCompleter -Native -CommandName ccconfig -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commands = @('list', 'ls', 'add', 'update', 'use', 'remove', 'rm', 'current', 'mode', 'env', 'edit', 'completion')
    $modes = @('settings', 'env')
    $formats = @('bash', 'zsh', 'fish', 'sh', 'powershell', 'pwsh', 'dotenv')

    # Parse the command line
    $tokens = $commandAst.ToString() -split '\\s+'
    $position = $tokens.Count - 1

    # If we're completing the first argument (command)
    if ($position -eq 1 -or ($position -eq 2 -and $wordToComplete)) {
        $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
        return
    }

    # Get the command (first argument)
    $command = if ($tokens.Count -gt 1) { $tokens[1] } else { '' }

    # Second argument completions based on command
    if ($position -eq 2 -or ($position -eq 3 -and $wordToComplete)) {
        switch ($command) {
            { $_ -in 'use', 'update', 'remove', 'rm' } {
                Get-CconfigProfiles | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
            'mode' {
                $modes | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
            'env' {
                $formats | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
            'completion' {
                @('bash', 'zsh', 'fish', 'powershell', 'pwsh') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
        }
        return
    }

    # Flag completions
    if ($position -ge 3 -and $command -eq 'use') {
        @('-p', '--permanent') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', 'Write permanently to shell config')
        }
    }

    if ($position -ge 2 -and $command -eq 'current') {
        @('-s', '--show-secret') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', 'Show full token')
        }
    }
}
`);
      break;

    default:
      console.error(`Error: Unsupported shell: ${shell}`);
      console.error('Supported shells: bash, zsh, fish, powershell, pwsh');
      process.exit(1);
  }
}

/**
 * Display help information
 */
function help() {
  console.log('Claude Code Configuration Manager');
  console.log('');
  console.log(`Profiles are stored in: ${PROFILES_FILE}`);
  console.log('');
  console.log('Supports two modes:');
  console.log(
      '  env      - Use environment variable files (default, cross-Shell, instant apply)');
  console.log(
      '  settings - Directly modify ~/.claude/settings.json (no Shell config needed)');
  console.log('');
  console.log('Usage:');
  console.log('  ccconfig [command] [options]');
  console.log('');
  console.log('Global Options:');
  console.log(
      '  -h, --help                                Display this help information');
  console.log(
      '  -V, --version                             Display version information');
  console.log('');
  console.log('Commands:');
  console.log(
      '  list|ls                                   List all configurations (default)');
  console.log(
      '  add [name]                                Add new configuration (interactive)');
  console.log(
      '  update [name]                             Update existing configuration (interactive)');
  console.log(
      '  use <name> [-p|--permanent]               Switch to specified configuration');
  console.log(
      '  remove|rm <name>                          Remove configuration');
  console.log(
      '  current [-s|--show-secret]                Display current configuration');
  console.log(
      '  mode [settings|env]                       View or switch mode');
  console.log(
      '  env [format]                              Output environment variables (env mode)');
  console.log(
      '  edit                                      Show configuration file location');
  console.log(
      '  completion <bash|zsh|fish|pwsh>           Generate shell completion script');
  console.log('');
  console.log('Flags:');
  console.log(
      '  -p, --permanent                           Write environment variables permanently to shell config');
  console.log(
      '                                            (only effective in env mode with use command)');
  console.log(
      '  -s, --show-secret                         Show full token in current command');
  console.log('');
  console.log('Configuration file locations:');
  console.log(`  Configuration list: ${PROFILES_FILE}`);
  console.log(`  Claude settings: ${CLAUDE_SETTINGS}`);
  console.log(`  Environment variables file: ${ENV_FILE}`);
}

// Main program
async function main() {
  const args = process.argv.slice(2);

  // Handle global flags first (standardized behavior)
  if (args.includes('--version') || args.includes('-V')) {
    showVersion();
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    help();
    return;
  }

  // Extract flags
  const showSecret = args.includes('--show-secret') || args.includes('-s');
  const permanent = args.includes('--permanent') || args.includes('-p');
  const filteredArgs = args.filter(
      arg => arg !== '--show-secret' && arg !== '-s' && arg !== '--permanent' &&
          arg !== '-p' && arg !== '--version' && arg !== '-V' &&
          arg !== '--help' && arg !== '-h');

  const command = filteredArgs[0];

  switch (command) {
    case 'list':
    case 'ls':
      list();
      break;
    case 'use':
      if (!filteredArgs[1]) {
        console.error('Error: Missing configuration name');
        console.error('Usage: ccconfig use <name> [-p|--permanent]');
        process.exit(1);
      }
      await use(filteredArgs[1], {permanent});
      break;
    case 'add':
      await add(filteredArgs[1]);
      break;
    case 'update':
      await update(filteredArgs[1]);
      break;
    case 'remove':
    case 'rm':
      remove(filteredArgs[1]);
      break;
    case 'current':
      current(showSecret);
      break;
    case 'mode':
      mode(filteredArgs[1]);
      break;
    case 'env':
      env(filteredArgs[1] || 'bash');
      break;
    case 'edit':
      edit();
      break;
    case 'completion':
      completion(filteredArgs[1]);
      break;
    default:
      if (!command) {
        list();
      } else {
        console.error(`Error: Unknown command '${command}'`);
        console.error('Run ccconfig --help to see help');
        process.exit(1);
      }
  }
}

function showVersion() {
  console.log(`ccconfig version ${PACKAGE_VERSION}`);
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
})();
