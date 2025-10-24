#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawn, execSync } = require('child_process');

// Configuration file paths
const CONFIG_DIR = path.join(os.homedir(), '.config', 'ccconfig');
const PROFILES_FILE = path.join(CONFIG_DIR, 'profiles.json');
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const ENV_FILE = path.join(CONFIG_DIR, 'current.env');
const MODE_FILE = path.join(CONFIG_DIR, 'mode');

// Default modes
const MODE_SETTINGS = 'settings';  // Directly modify ~/.claude/settings.json
const MODE_ENV = 'env';            // Use environment variable files

// Environment variable keys
const ENV_KEYS = {
  BASE_URL: 'ANTHROPIC_BASE_URL',
  AUTH_TOKEN: 'ANTHROPIC_AUTH_TOKEN',
  API_KEY: 'ANTHROPIC_API_KEY',
  MODEL: 'ANTHROPIC_MODEL',
  SMALL_FAST_MODEL: 'ANTHROPIC_SMALL_FAST_MODEL'
};

// Sensitive keys that should be masked
const SENSITIVE_KEYS = [ENV_KEYS.AUTH_TOKEN, ENV_KEYS.API_KEY];

function getProfilesMap(profiles) {
  return profiles && profiles.profiles ? profiles.profiles : {};
}

function isProfilesEmpty(profiles) {
  return !profiles || Object.keys(getProfilesMap(profiles)).length === 0;
}

function ensureProfilesAvailable({onEmpty} = {}) {
  const profiles = loadProfiles();
  if (isProfilesEmpty(profiles)) {
    if (typeof onEmpty === 'function') {
      onEmpty();
    } else {
      console.error('Error: No configurations found');
      console.error('Please add a configuration first: ccconfig add <name>');
    }
    process.exit(1);
  }
  return profiles;
}

function ensureProfileAvailable(
    name, {allowEmptyEnv = false, onEmptyProfiles, onMissingProfile, onEmptyEnv} = {}) {
  const profiles = ensureProfilesAvailable({onEmpty: onEmptyProfiles});
  const profilesMap = getProfilesMap(profiles);
  const profile = profilesMap[name];

  if (!profile) {
    if (typeof onMissingProfile === 'function') {
      onMissingProfile();
    } else {
      console.error(`Error: Configuration '${name}' does not exist`);
      console.error('');
      console.error('Run ccconfig list to see available configurations');
    }
    process.exit(1);
  }

  if (!allowEmptyEnv && (!profile.env || Object.keys(profile.env).length === 0)) {
    if (typeof onEmptyEnv === 'function') {
      onEmptyEnv();
    } else {
      console.error(
          `Error: Configuration '${name}' has empty environment variables`);
      console.error('Please edit the configuration file to add env field');
    }
    process.exit(1);
  }

  return {profile, profiles};
}

// All supported commands
const COMMANDS = ['list', 'ls', 'add', 'update', 'use', 'start', 'safe-start', 'remove', 'rm', 'current', 'mode', 'env', 'edit', 'completion'];

// ccconfig markers for shell config files
const SHELL_MARKERS = {
  start: '# >>> ccconfig >>>',
  end: '# <<< ccconfig <<<'
};

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
 * Ensure directory exists with secure permissions
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  } else if (os.platform() !== 'win32') {
    // Ensure existing directory has correct permissions
    try {
      fs.chmodSync(dir, 0o700);
    } catch (e) {
      // Ignore permission errors - may not own the directory
    }
  }
}

/**
 * Utility: Mask sensitive value for display
 */
function maskValue(key, value, shouldMask = true) {
  const v = String(value ?? '');
  if (!v || v === '(not set)') return v;
  if (!shouldMask || !SENSITIVE_KEYS.includes(key)) return v;
  return v.length > 20 ? v.substring(0, 20) + '...' : v;
}

/**
 * Utility: Print environment variable value (with optional masking)
 */
function printEnvVar(key, value, mask = true) {
  const v = String(value ?? '');
  const displayValue = v ? maskValue(key, v, mask) : '(not set)';
  console.log(`  ${key}: ${displayValue}`);
}

/**
 * Utility: Display environment variables with consistent formatting
 */
function displayEnvVars(envVars, mask = true, indent = '  ') {
  const keys = [ENV_KEYS.BASE_URL, ENV_KEYS.AUTH_TOKEN, ENV_KEYS.API_KEY, ENV_KEYS.MODEL, ENV_KEYS.SMALL_FAST_MODEL];
  for (const key of keys) {
    if (!(key in envVars)) continue;
    const value = envVars[key];
    if (!value && key !== ENV_KEYS.BASE_URL && key !== ENV_KEYS.AUTH_TOKEN && key !== ENV_KEYS.API_KEY) continue;
    const displayValue = maskValue(key, value, mask);
    console.log(`${indent}${key}: ${displayValue || '(not set)'}`);
  }
}

/**
 * Utility: Interactive readline helper
 */
class ReadlineHelper {
  constructor() {
    this.rl = null;
  }

  ensureInterface() {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    }
  }

  async ask(question, defaultValue = '', options = {}) {
    this.ensureInterface();
    const { brackets = 'parentheses' } = options;
    const left = brackets === 'square' ? '[' : '(';
    const right = brackets === 'square' ? ']' : ')';
    const suffix = defaultValue ? ` ${left}${defaultValue}${right}` : '';

    return new Promise(resolve => {
      this.rl.question(`${question}${suffix}: `, answer => {
        const trimmed = answer.trim();
        resolve(trimmed || defaultValue);
      });
    });
  }

  async askEnvVars(existingEnv = {}) {
    const baseUrl = await this.ask(
      'ANTHROPIC_BASE_URL (press Enter to keep current/default)',
      existingEnv.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      { brackets: existingEnv.ANTHROPIC_BASE_URL ? 'square' : 'parentheses' }
    );

    const authToken = await this.ask(
      'ANTHROPIC_AUTH_TOKEN (press Enter to keep current/set empty)',
      existingEnv.ANTHROPIC_AUTH_TOKEN || '',
      { brackets: existingEnv.ANTHROPIC_AUTH_TOKEN ? 'square' : 'parentheses' }
    );

    const apiKey = await this.ask(
      'ANTHROPIC_API_KEY (press Enter to keep current/set empty)',
      existingEnv.ANTHROPIC_API_KEY || '',
      { brackets: existingEnv.ANTHROPIC_API_KEY ? 'square' : 'parentheses' }
    );

    const model = await this.ask(
      'ANTHROPIC_MODEL (press Enter to skip/keep current)',
      existingEnv.ANTHROPIC_MODEL || '',
      { brackets: existingEnv.ANTHROPIC_MODEL ? 'square' : 'parentheses' }
    );

    const smallFastModel = await this.ask(
      'ANTHROPIC_SMALL_FAST_MODEL (press Enter to skip/keep current)',
      existingEnv.ANTHROPIC_SMALL_FAST_MODEL || '',
      { brackets: existingEnv.ANTHROPIC_SMALL_FAST_MODEL ? 'square' : 'parentheses' }
    );

    const envVars = {
      [ENV_KEYS.BASE_URL]: baseUrl || '',
      [ENV_KEYS.AUTH_TOKEN]: authToken || '',
      [ENV_KEYS.API_KEY]: apiKey || ''
    };

    if (model) envVars[ENV_KEYS.MODEL] = model;
    if (smallFastModel) envVars[ENV_KEYS.SMALL_FAST_MODEL] = smallFastModel;

    return envVars;
  }

  close() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

/**
 * Utility: Check if terminal is interactive
 */
function requireInteractive(commandName) {
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  if (!isInteractive) {
    console.error(`Error: Interactive mode required for ${commandName}`);
    console.error('This command must be run in an interactive terminal');
    process.exit(1);
  }
}

/**
 * Utility: Display environment variables section for current command
 */
function displayEnvSection(envVars, showSecret) {
  if (!envVars || (!envVars[ENV_KEYS.BASE_URL] && !envVars[ENV_KEYS.AUTH_TOKEN] && !envVars[ENV_KEYS.API_KEY])) {
    console.log('  (not configured)');
    return;
  }

  const normalizedEnv = {
    [ENV_KEYS.BASE_URL]: envVars[ENV_KEYS.BASE_URL] || '(not set)',
    [ENV_KEYS.AUTH_TOKEN]: envVars[ENV_KEYS.AUTH_TOKEN] || envVars[ENV_KEYS.API_KEY] || '(not set)',
    [ENV_KEYS.MODEL]: envVars[ENV_KEYS.MODEL],
    [ENV_KEYS.SMALL_FAST_MODEL]: envVars[ENV_KEYS.SMALL_FAST_MODEL]
  };

  // Mask token if needed
  if (normalizedEnv[ENV_KEYS.AUTH_TOKEN] !== '(not set)' && !showSecret) {
    const token = normalizedEnv[ENV_KEYS.AUTH_TOKEN];
    normalizedEnv[ENV_KEYS.AUTH_TOKEN] = token.substring(0, 20) + '...';
  }

  // Display with aligned columns
  console.log(`  ${ENV_KEYS.BASE_URL}:   ${normalizedEnv[ENV_KEYS.BASE_URL]}`);
  console.log(`  ${ENV_KEYS.AUTH_TOKEN}: ${normalizedEnv[ENV_KEYS.AUTH_TOKEN]}`);
  if (normalizedEnv[ENV_KEYS.MODEL]) {
    console.log(`  ${ENV_KEYS.MODEL}:      ${normalizedEnv[ENV_KEYS.MODEL]}`);
  }
  if (normalizedEnv[ENV_KEYS.SMALL_FAST_MODEL]) {
    console.log(`  ${ENV_KEYS.SMALL_FAST_MODEL}: ${normalizedEnv[ENV_KEYS.SMALL_FAST_MODEL]}`);
  }
}

/**
 * Validate configuration name
 * @param {string} name - Configuration name to validate
 * @param {boolean} allowEmpty - Whether to allow empty names (default: false)
 * @returns {boolean} - Returns true if valid, exits process if invalid
 */
function validateConfigName(name, allowEmpty = false) {
  if (!name || name.trim() === '') {
    if (allowEmpty) {
      return true;
    }
    console.error('Error: Configuration name cannot be empty');
    process.exit(1);
  }

  // Allow only alphanumeric characters, hyphens, and underscores
  const CONFIG_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
  if (!CONFIG_NAME_REGEX.test(name)) {
    console.error(`Error: Invalid configuration name '${name}'`);
    console.error('');
    console.error('Configuration names can only contain:');
    console.error('  • Letters (a-z, A-Z)');
    console.error('  • Numbers (0-9)');
    console.error('  • Hyphens (-)');
    console.error('  • Underscores (_)');
    console.error('');
    console.error('Examples of valid names:');
    console.error('  • work');
    console.error('  • personal');
    console.error('  • project-1');
    console.error('  • staging_env');
    process.exit(1);
  }

  // Limit length to prevent issues
  const MAX_NAME_LENGTH = 50;
  if (name.length > MAX_NAME_LENGTH) {
    console.error(`Error: Configuration name too long (max ${MAX_NAME_LENGTH} characters)`);
    console.error(`Current length: ${name.length}`);
    process.exit(1);
  }

  return true;
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
  for (const key of Object.values(ENV_KEYS)) {
    delete settings.env[key];
  }

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
    const lines = Object.entries(envVars).map(([key, value]) => {
      // Escape special characters to prevent injection
      const escapedValue = String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `${key}=${escapedValue}`;
    });
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
      // Only accept valid environment variable names: starts with letter or underscore,
      // followed by letters, numbers, or underscores
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        // Unescape special characters
        // IMPORTANT: Must unescape \\\\ first to avoid double-unescaping
        const unescapedValue = match[2]
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t');
        env[match[1]] = unescapedValue;
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
  initIfNeeded();
  requireInteractive('adding configurations');

  const helper = new ReadlineHelper();

  try {
    if (!name) {
      name = await helper.ask('Please enter configuration name (e.g., work)');
    }

    validateConfigName(name);

    const profiles = loadProfiles() || {profiles: {}};
    const profilesMap = getProfilesMap(profiles);

    if (profilesMap[name]) {
      console.error(`Error: Configuration '${name}' already exists`);
      console.error('');
      console.error('To modify this configuration, use one of:');
      console.error(`  ccconfig update ${name}    # Interactive update`);
      console.error(`  ccconfig edit              # Manual edit`);
      process.exit(1);
    }

    console.log('Please enter the following information:');
    console.log('');

    const envVars = await helper.askEnvVars();

    profiles.profiles[name] = {env: envVars};
    saveProfiles(profiles);

    console.log(`✓ Configuration '${name}' added`);
    console.log('');
    console.log('Run the following command to activate:');
    console.log(`  ccconfig use ${name}`);
    console.log('');
    console.log('Saved environment variables:');
    displayEnvVars(envVars);
    console.log('');
    console.log('This information has been saved to:');
    console.log(`  ${PROFILES_FILE}`);
    console.log('You can edit this file directly to further customize the profile:');
    console.log(`  vim ${PROFILES_FILE}`);
    console.log('Or run ccconfig edit to open it with your preferred editor');
  } finally {
    helper.close();
  }
}

/**
 * Update existing configuration
 */
async function update(name) {
  initIfNeeded();
  requireInteractive('updating configurations');

  const helper = new ReadlineHelper();

  try {
    if (!name) {
      name = await helper.ask('Please enter configuration name to update');
    }

    validateConfigName(name);

    const {profile, profiles} = ensureProfileAvailable(name, {
      allowEmptyEnv: true,
      onEmptyProfiles: () => {
        console.error('Error: Configuration file does not exist');
        process.exit(1);
      },
      onMissingProfile: () => {
        console.error(`Error: Configuration '${name}' does not exist`);
        console.error('');
        console.error('Run ccconfig list to see available configurations');
        console.error(`Or use 'ccconfig add ${name}' to create a new configuration`);
        process.exit(1);
      }
    });

    const existingEnv = profile.env || {};

    console.log(`Updating configuration '${name}'`);
    console.log('Press Enter to keep current value/default, or enter new value to update');
    console.log('');

    const envVars = await helper.askEnvVars(existingEnv);

    const profilesMap = getProfilesMap(profiles);
    profilesMap[name] = {env: envVars};
    saveProfiles(profiles);

    console.log(`✓ Configuration '${name}' updated`);
    console.log('');
    console.log('Updated environment variables:');
    displayEnvVars(envVars);
    console.log('');
    console.log('Run the following command to activate:');
    console.log(`  ccconfig use ${name}`);
  } finally {
    helper.close();
  }
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

  // Validate configuration name
  validateConfigName(name);

  const {profiles} = ensureProfileAvailable(name, {
    allowEmptyEnv: true,
    onEmptyProfiles: () => {
      console.error('Error: Configuration file does not exist');
    },
    onMissingProfile: () => {
      console.error(`Error: Configuration '${name}' does not exist`);
    }
  });

  delete getProfilesMap(profiles)[name];
  saveProfiles(profiles);
  console.log(`✓ Configuration '${name}' removed`);
}

/**
 * Detect current shell and return recommended activation command
 */
function detectShellCommand() {
  const shellType = ShellUtils.detectType();
  if (!shellType) {
    return {shell: null, command: null};
  }
  const command = ShellUtils.getActivationCommand(shellType);
  const shellName = shellType === 'powershell' ? 'PowerShell' : shellType;
  return {shell: shellName, command};
}

/**
 * Shell utilities - unified shell detection, escaping, and formatting
 */
const ShellUtils = {
  // Escape functions for different shells
  escape: {
    posix: (value) => {
      const str = value == null ? '' : String(value);
      return `'${str.replace(/'/g, `'"'"'`)}'`;
    },
    fish: (value) => {
      const str = value == null ? '' : String(value);
      return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
    },
    pwsh: (value) => {
      const str = value == null ? '' : String(value);
      return `'${str.replace(/'/g, `''`)}'`;
    }
  },

  // Detect current shell type
  detectType: () => {
    const shellPath = (process.env.SHELL || '').toLowerCase();

    if (process.env.FISH_VERSION || shellPath.includes('fish')) {
      return 'fish';
    }
    if (process.env.ZSH_NAME || process.env.ZSH_VERSION || shellPath.includes('zsh')) {
      return 'zsh';
    }
    if (process.env.POWERSHELL_DISTRIBUTION_CHANNEL || shellPath.includes('pwsh') || shellPath.includes('powershell')) {
      return 'powershell';
    }
    if (shellPath.includes('bash')) {
      return 'bash';
    }
    if (process.platform === 'win32') {
      const comSpec = (process.env.ComSpec || '').toLowerCase();
      if (comSpec.includes('powershell')) {
        return 'powershell';
      }
    }
    return null;
  },

  // Get shell config file path
  getConfigPath: (shellType) => {
    const homeDir = os.homedir();
    const configs = {
      fish: path.join(homeDir, '.config', 'fish', 'config.fish'),
      zsh: path.join(homeDir, '.zshrc'),
      bash: process.platform === 'darwin'
        ? (fs.existsSync(path.join(homeDir, '.bash_profile')) || !fs.existsSync(path.join(homeDir, '.bashrc'))
          ? path.join(homeDir, '.bash_profile')
          : path.join(homeDir, '.bashrc'))
        : path.join(homeDir, '.bashrc'),
      powershell: process.platform === 'win32'
        ? path.join(process.env.USERPROFILE || homeDir, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
        : path.join(homeDir, '.config', 'powershell', 'profile.ps1')
    };
    return configs[shellType];
  },

  // Get activation command for specific shell
  getActivationCommand: (shellType) => {
    const commands = {
      fish: 'ccconfig env fish | source',
      zsh: 'eval $(ccconfig env bash)',
      bash: 'eval $(ccconfig env bash)',
      powershell: 'ccconfig env pwsh | iex'
    };
    return commands[shellType];
  },

  // Format environment variables for specific shell
  formatEnvVars: (envVars, format) => {
    const lines = [];
    for (const [key, value] of Object.entries(envVars)) {
      switch (format) {
        case 'fish':
          lines.push(`set -gx ${key} "${ShellUtils.escape.fish(value)}"`);
          break;
        case 'bash':
        case 'zsh':
        case 'sh':
          lines.push(`export ${key}=${ShellUtils.escape.posix(value)}`);
          break;
        case 'powershell':
        case 'pwsh':
          lines.push(`$env:${key}=${ShellUtils.escape.pwsh(value)}`);
          break;
        case 'dotenv':
          const renderedValue = value == null ? '' : String(value);
          const escapedValue = renderedValue
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
          lines.push(`${key}=${escapedValue}`);
          break;
      }
    }
    return lines;
  }
};

// Legacy function wrappers for backward compatibility
function escapePosix(value) { return ShellUtils.escape.posix(value); }
function escapeFish(value) { return ShellUtils.escape.fish(value); }
function escapePwsh(value) { return ShellUtils.escape.pwsh(value); }

/**
 * Detect shell type and config file path
 */
function detectShellConfig() {
  const shellType = ShellUtils.detectType();
  if (!shellType) {
    return {shell: null, configPath: null, detected: false};
  }
  const configPath = ShellUtils.getConfigPath(shellType);
  return {shell: shellType, configPath, detected: true};
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
  const marker = SHELL_MARKERS.start;
  const markerEnd = SHELL_MARKERS.end;

  // Generate environment variable lines (real and masked)
  const maskedEnvVars = {};
  for (const [key, value] of Object.entries(envVars)) {
    maskedEnvVars[key] = maskValue(key, value, true);
  }

  const envLines = ShellUtils.formatEnvVars(envVars, shell);
  const maskedEnvLines = ShellUtils.formatEnvVars(maskedEnvVars, shell);

  const envBlock = `${marker}\n${envLines.join('\n')}\n${markerEnd}\n`;
  const maskedEnvBlock = `${marker}\n${maskedEnvLines.join('\n')}\n${markerEnd}\n`;

  // Display warning and confirmation
  console.log('');
  console.log('⚠️  WARNING: This will modify your shell configuration file');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Target file: ${configPath}`);
  console.log('');
  console.log('The following block will be added/updated:');
  console.log('───────────────────────────────────────────');
  console.log(maskedEnvBlock.trim());
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
  // Validate configuration name
  validateConfigName(name);

  const {profile} = ensureProfileAvailable(name, {
    onEmptyProfiles: () => {
      console.error('Error: No configurations found');
      console.error('Please add a configuration first: ccconfig add <name>');
    },
    onMissingProfile: () => {
      console.error(`Error: Configuration '${name}' does not exist`);
      console.error('');
      console.error('Run ccconfig list to see available configurations');
    },
    onEmptyEnv: () => {
      console.error(
          `Error: Configuration '${name}' has empty environment variables`);
      console.error('Please edit the configuration file to add env field');
    }
  });

  const mode = getMode();
  const permanent = options.permanent || false;

  if (mode === MODE_SETTINGS) {
    // Settings mode: directly modify ~/.claude/settings.json
    updateClaudeSettings(profile.env);

    console.log(`✓ Switched to configuration: ${name} (settings mode)`);
    console.log(`  Environment variables:`);
    displayEnvVars(profile.env, true, '    ');
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
    displayEnvVars(profile.env, true, '    ');
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
  displayEnvSection(settings.env, showSecret);
  console.log('');

  // Display environment variable file configuration
  console.log(`【2】Environment Variables File (${ENV_FILE}):`);
  displayEnvSection(envFile, showSecret);
  console.log('');

  // Display current process environment variables
  console.log('【3】Current Process Environment Variables:');
  displayEnvSection(processEnv, showSecret);
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
    console.error('Error: No available environment variable configuration found');
    console.error('Please run ccconfig use <name> to select a configuration first');
    process.exit(1);
  }

  const supportedFormats = ['fish', 'bash', 'zsh', 'sh', 'powershell', 'pwsh', 'dotenv'];
  if (!supportedFormats.includes(format)) {
    console.error(`Error: Unsupported format: ${format}`);
    console.error(`Supported formats: ${supportedFormats.join(', ')}`);
    process.exit(1);
  }

  const lines = ShellUtils.formatEnvVars(envVars, format);
  lines.forEach(line => console.log(line));
}

/**
 * Start Claude Code with specified profile (internal implementation)
 * @param {string} name - Profile name
 * @param {Array} extraArgs - Additional arguments to pass to Claude
 * @param {Object} options - Options object
 * @param {boolean} options.safe - Whether to run in safe mode (default: false)
 */
function startClaude(name, extraArgs = [], options = {}) {
  const { safe = false } = options;
  const commandName = safe ? 'safe-start' : 'start';

  if (!name) {
    console.error('Error: Missing configuration name');
    console.error(`Usage: ccconfig ${commandName} <name> [claude-args...]`);
    process.exit(1);
  }

  // Validate configuration name
  validateConfigName(name);

  const {profile} = ensureProfileAvailable(name, {
    onEmptyProfiles: () => {
      console.error('Error: No configurations found');
      console.error('Please add a configuration first: ccconfig add <name>');
    },
    onMissingProfile: () => {
      console.error(`Error: Configuration '${name}' does not exist`);
      console.error('Run ccconfig list to see available configurations');
    },
    onEmptyEnv: () => {
      console.error(
          `Error: Configuration '${name}' has empty environment variables`);
      console.error('Please edit the configuration file to add env field');
    }
  });

  // Check if claude binary exists before proceeding
  try {
    const command = process.platform === 'win32' ? 'where claude' : 'which claude';
    execSync(command, { stdio: 'pipe' });
  } catch (err) {
    console.error('Error: Claude Code CLI not found');
    console.error('');
    console.error('Please make sure Claude Code CLI is installed:');
    console.error('  npm install -g claude-code');
    process.exit(1);
  }

  // Display startup message
  const modeLabel = safe ? ' (safe mode)' : '';
  console.log(`Starting Claude Code with profile: ${name}${modeLabel}`);
  console.log('Environment variables:');
  for (const [key, value] of Object.entries(profile.env)) {
    const strValue = String(value ?? '');
    const displayValue =
        strValue.length > 20 ? strValue.substring(0, 20) + '...' : strValue;
    console.log(`  ${key}: ${displayValue}`);
  }

  // Build Claude arguments based on mode
  const claudeArgs = safe ? extraArgs : ['--dangerously-skip-permissions', ...extraArgs];

  // Display mode-specific notes
  console.log('');
  if (safe) {
    console.log('Note: Running in safe mode (permission confirmation required)');
    console.log('      Claude Code will ask for confirmation before executing commands');
    console.log('      For automatic execution, use "ccconfig start" instead');
  } else {
    console.log('Note: Starting with --dangerously-skip-permissions flag enabled');
    console.log('      This allows Claude Code to execute commands without confirmation prompts');
    console.log('      Only use this with profiles you trust');
  }
  console.log('');

  if (extraArgs.length > 0) {
    const argsLabel = safe ? 'Arguments' : 'Additional arguments';
    console.log(`${argsLabel}: ${extraArgs.join(' ')}`);
    console.log('');
  }

  // Merge profile env vars with current process env
  // Normalize all profile env values to strings (spawn requires string values)
  const normalizedEnv = {};
  for (const [key, value] of Object.entries(profile.env)) {
    normalizedEnv[key] = String(value ?? '');
  }
  const envVars = {...process.env, ...normalizedEnv};

  // Spawn claude process
  const claude = spawn('claude', claudeArgs, {
    env: envVars,
    stdio: 'inherit'  // Inherit stdin, stdout, stderr from parent process
  });

  // Handle process exit
  claude.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Claude Code exited with code ${code}`);
      process.exit(code);
    }
    process.exit(0);
  });

  claude.on('error', (err) => {
    console.error(`Error starting Claude Code: ${err.message}`);
    console.error('');
    console.error('Please make sure Claude Code CLI is installed:');
    console.error('  npm install -g claude-code');
    process.exit(1);
  });
}

/**
 * Start Claude Code with specified profile (auto-approve mode)
 */
function start(name, extraArgs = []) {
  return startClaude(name, extraArgs, { safe: false });
}

/**
 * Start Claude Code with specified profile (safe mode - requires permission confirmation)
 */
function safeStart(name, extraArgs = []) {
  return startClaude(name, extraArgs, { safe: true });
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

  const commands = COMMANDS.join(' ');

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
        use|start|safe-start|update|remove|rm)
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
    'start:Start Claude Code (auto-approve mode)'
    'safe-start:Start Claude Code (safe mode, requires confirmation)'
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
        use|start|safe-start|update|remove|rm)
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
complete -c ccconfig -f -n "__fish_use_subcommand" -a "start" -d "Start Claude Code (auto-approve mode)"
complete -c ccconfig -f -n "__fish_use_subcommand" -a "safe-start" -d "Start Claude Code (safe mode, requires confirmation)"
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

# Profile name completion for use, start, safe-start, update, remove
complete -c ccconfig -f -n "__fish_seen_subcommand_from use start safe-start update remove rm" -a "(__ccconfig_profiles)"

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

    $commands = @('list', 'ls', 'add', 'update', 'use', 'start', 'safe-start', 'remove', 'rm', 'current', 'mode', 'env', 'edit', 'completion')
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
            { $_ -in 'use', 'start', 'safe-start', 'update', 'remove', 'rm' } {
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
      '  start <name> [claude-args...]             Start Claude Code (auto-approve mode)');
  console.log(
      '  safe-start <name> [claude-args...]        Start Claude Code (safe mode, requires confirmation)');
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
  console.log('Notes:');
  console.log(
      '  • Two ways to start Claude Code:');
  console.log(
      '    - start:      Auto-approve mode (adds --dangerously-skip-permissions)');
  console.log(
      '                  Fast and convenient, but use only with profiles you trust');
  console.log(
      '    - safe-start: Safe mode (requires manual confirmation for each command)');
  console.log(
      '                  Recommended for production or untrusted environments');
  console.log('');
  console.log('Configuration file locations:');
  console.log(`  Configuration list: ${PROFILES_FILE}`);
  console.log(`  Claude settings: ${CLAUDE_SETTINGS}`);
  console.log(`  Environment variables file: ${ENV_FILE}`);
}

// Main program
async function main() {
  const args = process.argv.slice(2);

  // Handle global flags first (can appear anywhere)
  if (args.includes('--version') || args.includes('-V')) {
    showVersion();
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    help();
    return;
  }

  // Find the command (first non-flag argument)
  let commandIndex = -1;
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('-')) {
      commandIndex = i;
      break;
    }
  }

  // If no command found, default to 'list'
  const command = commandIndex >= 0 ? args[commandIndex] : null;

  // Extract flags and arguments based on command type
  let showSecret = false;
  let permanent = false;
  let filteredArgs = [];

  // Commands that pass through arguments to Claude Code
  const passThruCommands = ['start', 'safe-start'];

  if (passThruCommands.includes(command)) {
    // For pass-through commands:
    // - Extract flags that appear BEFORE the command
    // - Keep command and all arguments after it unchanged (for Claude)
    const preCommandArgs = commandIndex >= 0 ? args.slice(0, commandIndex) : [];
    showSecret = preCommandArgs.includes('--show-secret') || preCommandArgs.includes('-s');
    permanent = preCommandArgs.includes('--permanent') || preCommandArgs.includes('-p');

    // Keep command and all arguments after it (these go to Claude)
    filteredArgs = commandIndex >= 0 ? args.slice(commandIndex) : [];
  } else {
    // For normal commands:
    // - Extract flags from anywhere in the arguments
    // - Remove all recognized flags from arguments
    showSecret = args.includes('--show-secret') || args.includes('-s');
    permanent = args.includes('--permanent') || args.includes('-p');

    // Filter out all recognized flags
    filteredArgs = args.filter(arg =>
      arg !== '--show-secret' &&
      arg !== '-s' &&
      arg !== '--permanent' &&
      arg !== '-p' &&
      arg !== '--version' &&
      arg !== '-V' &&
      arg !== '--help' &&
      arg !== '-h'
    );
  }

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
    case 'start':
      if (!filteredArgs[1]) {
        console.error('Error: Missing configuration name');
        console.error('Usage: ccconfig start <name> [claude-args...]');
        process.exit(1);
      }
      // Pass all arguments after the profile name to Claude
      start(filteredArgs[1], filteredArgs.slice(2));
      break;
    case 'safe-start':
      if (!filteredArgs[1]) {
        console.error('Error: Missing configuration name');
        console.error('Usage: ccconfig safe-start <name> [claude-args...]');
        process.exit(1);
      }
      // Pass all arguments after the profile name to Claude
      safeStart(filteredArgs[1], filteredArgs.slice(2));
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
