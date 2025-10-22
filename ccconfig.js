#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Configuration file paths
const CONFIG_DIR = path.join(os.homedir(), '.config', 'claude-code');
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
    if (profile.description) {
      console.log(`    Description: ${profile.description}`);
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

  let baseUrl, authToken, apiKey, description;

  try {
    if (!name) {
      name = await askQuestion('Please enter configuration name (e.g., work)');
    }

    if (!name) {
      console.error('Error: Configuration name cannot be empty');
      process.exit(1);
    }

    baseUrl = await askQuestion(
        'Please enter ANTHROPIC_BASE_URL (can be empty, default https://api.anthropic.com)',
        'https://api.anthropic.com');

    authToken =
        await askQuestion('Please enter ANTHROPIC_AUTH_TOKEN (can be empty)');

    apiKey = await askQuestion('Please enter ANTHROPIC_API_KEY (can be empty)');

    description = await askQuestion(
        'Please enter configuration description (can be empty)');
  } finally {
    if (rl) {
      rl.close();
    }
  }

  const profiles = loadProfiles() || {profiles: {}};

  if (profiles.profiles[name]) {
    console.error(`Error: Configuration '${name}' already exists`);
    console.error('To update, please edit the configuration file directly');
    process.exit(1);
  }

  const envVars = {
    ANTHROPIC_BASE_URL: baseUrl || '',
    ANTHROPIC_AUTH_TOKEN: authToken || '',
    ANTHROPIC_API_KEY: apiKey || ''
  };

  profiles.profiles[name] = {env: envVars, description};

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
  console.log('');
  console.log('This information has been saved to:');
  console.log(`  ${PROFILES_FILE}`);
  console.log(
      'You can edit this file directly to further customize the profile:');
  console.log(`  vim ${PROFILES_FILE}`);
  console.log('Or run ccconfig edit to open it with your preferred editor');
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

/**
 * Switch configuration
 */
function use(name) {
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
    console.log('');
    const shellSuggestion = detectShellCommand();
    const applyCommands = [
      {command: 'eval $(ccconfig env bash)', note: '# Bash/Zsh'},
      {command: 'ccconfig env fish | source', note: '# Fish'},
      {command: 'ccconfig env pwsh | iex', note: '# PowerShell'}
    ];

    console.log('Apply immediately in current Shell (optional):');

    if (shellSuggestion.command) {
      console.log(
          `  ${shellSuggestion.command}  # Detected ${shellSuggestion.shell}`);

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
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
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
    console.log('Use --show-secret to display full token');
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
      console.log('  - No Shell configuration needed');
      console.log('  - Restart Claude Code to take effect');
    } else {
      console.log('ENV mode:');
      console.log('  - Use environment variable files');
      console.log('  - Need to configure Shell loading script');
      console.log('  - Cross-Shell configuration sharing');
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
        const renderedValue = value == null ? '' : String(value);
        console.log(`set -gx ${key} "${renderedValue}"`);
      }
      break;
    case 'bash':
    case 'zsh':
    case 'sh':
      for (const [key, value] of Object.entries(envVars)) {
        const renderedValue = value == null ? '' : String(value);
        console.log(`export ${key}="${renderedValue}"`);
      }
      break;
    case 'powershell':
    case 'pwsh':
      for (const [key, value] of Object.entries(envVars)) {
        const renderedValue = value == null ? '' : String(value);
        console.log(`$env:${key}="${renderedValue}"`);
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
      '  --help, -h                                Display this help information');
  console.log(
      '  --version, -V                             Display version information');
  console.log('');
  console.log('Commands:');
  console.log(
      '  list|ls                                   List all configurations (default)');
  console.log(
      '  add [name]                                Add new configuration (interactive)');
  console.log(
      '  use <name>                                Switch to specified configuration');
  console.log(
      '  remove|rm <name>                          Remove configuration');
  console.log(
      '  current [--show-secret]                   Display current configuration');
  console.log(
      '  mode [settings|env]                       View or switch mode');
  console.log(
      '  env [format]                              Output environment variables (env mode)');
  console.log(
      '  edit                                      Show configuration file location');
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
  const showSecret = args.includes('--show-secret');
  const filteredArgs = args.filter(
      arg => arg !== '--show-secret' && arg !== '--version' && arg !== '-V' &&
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
        console.error('Usage: ccconfig use <name>');
        process.exit(1);
      }
      use(filteredArgs[1]);
      break;
    case 'add':
      await add(filteredArgs[1]);
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
