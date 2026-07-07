// ═══════════════════════════════════════════════════════════════════════════════
// STDOUT GUARD — Must be the VERY FIRST thing in this file, before any require.
//
// Problem: Electron's runtime (Chromium, GPU process, sandbox, etc.) can write
// diagnostic messages to stdout during startup. The MCP protocol uses
// newline-delimited JSON over stdio — every line on stdout is parsed with
// JSON.parse(). Any non-JSON output (even a blank line) breaks the protocol.
//
// Fix: In server mode, intercept process.stdout.write() BEFORE Electron or
// any other module loads. Only allow writes that look like JSON-RPC messages
// (lines starting with '{') through to the real stdout. Everything else is
// silently redirected to stderr so it still appears in logs.
// ═══════════════════════════════════════════════════════════════════════════════
const _isServerMode = process.argv.includes('--server');

if (_isServerMode) {
  const _realStdoutWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = function (chunk, encoding, callback) {
    // Normalise to string for inspection
    const str = typeof chunk === 'string'
      ? chunk
      : Buffer.isBuffer(chunk)
        ? chunk.toString('utf-8')
        : String(chunk);

    // MCP SDK serialises every message as:  JSON.stringify(msg) + '\n'
    // So legitimate writes always start with '{'.
    // Allow those through on the real stdout.
    const trimmed = str.trimStart();
    if (trimmed.startsWith('{')) {
      return _realStdoutWrite(chunk, encoding, callback);
    }

    // Everything else (Electron banners, GPU warnings, blank lines, etc.)
    // goes to stderr so it still shows up in debug logs.
    return process.stderr.write(chunk, encoding, callback);
  };
}
// ═══════════════════════════════════════════════════════════════════════════════

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');

// Suppress Electron security warnings (they can also go to stdout in some builds)
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const ENV_DIR = path.join(os.homedir(), '.mcp-abap-abap-adt-api');
const ENV_FILE = path.join(ENV_DIR, '.env');

// ─── Server mode ────────────────────────────────────────────────────────────
if (_isServerMode) {
  app.disableHardwareAcceleration();

  // Load saved environment variables
  if (fs.existsSync(ENV_FILE)) {
    dotenv.config({ path: ENV_FILE });
  }

  // Start the MCP server — it hooks into process.stdin / process.stdout
  require('../dist/index.js');

  // Electron still needs an 'app ready' handler to stay alive
  app.on('ready', () => { /* no window */ });

  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());

  return;
}

// ─── GUI mode ───────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Körber Stellium AI Connector'
  });

  mainWindow.maximize();
  mainWindow.show();

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('get-schema', () => {
    const schemaPath = path.join(__dirname, '..', 'env-schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    return JSON.parse(schemaContent);
  });

  ipcMain.handle('load-env', () => {
    if (fs.existsSync(ENV_FILE)) {
      return dotenv.parse(fs.readFileSync(ENV_FILE));
    }
    return {};
  });

  ipcMain.handle('save-env', (event, values) => {
    if (!fs.existsSync(ENV_DIR)) {
      fs.mkdirSync(ENV_DIR, { recursive: true });
    }

    let envContent = '';
    for (const [key, value] of Object.entries(values)) {
      envContent += `${key}=${value}\n`;
    }

    fs.writeFileSync(ENV_FILE, envContent);
    return true;
  });

  ipcMain.handle('get-server-command', () => {
    const isPackaged = app.isPackaged;
    const appRoot = path.resolve(__dirname, '..');

    if (isPackaged) {
      // In a packaged app, the executable is the app itself.
      // We want to run it as a Node process by setting ELECTRON_RUN_AS_NODE=1.
      const scriptPath = path.join(process.resourcesPath, 'app.asar', 'electron', 'server-entry.js');
      return {
        command: process.execPath,
        args: [scriptPath],
        env: { ELECTRON_RUN_AS_NODE: "1" }
      };
    } else {
      // In dev mode, process.execPath is electron.exe
      const scriptPath = path.join(appRoot, 'electron', 'server-entry.js');
      return {
        command: process.execPath,
        args: [scriptPath],
        env: { ELECTRON_RUN_AS_NODE: "1" }
      };
    }
  });
  ipcMain.handle('update-claude-config', (event, configJson) => {
    const localAppData = process.env.LOCALAPPDATA;
    const packagesDir = path.join(localAppData, 'Packages');
    let claudeConfigPath = null;

    if (fs.existsSync(packagesDir)) {
      const packages = fs.readdirSync(packagesDir);
      const claudePackage = packages.find(p => p.startsWith('Claude_'));
      if (claudePackage) {
        const configPath = path.join(packagesDir, claudePackage, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json');
        if (fs.existsSync(configPath)) {
          claudeConfigPath = configPath;
        }
      }
    }

    if (!claudeConfigPath) {
      const appData = process.env.APPDATA;
      const configPath = path.join(appData, 'Claude', 'claude_desktop_config.json');
      if (fs.existsSync(configPath)) {
        claudeConfigPath = configPath;
      }
    }

    if (claudeConfigPath) {
      let currentConfig = {};
      try {
        currentConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      } catch (e) {
        // ignore parsing error, assume empty
      }

      if (!currentConfig.mcpServers) {
        currentConfig.mcpServers = {};
      }

      currentConfig.mcpServers["koerber-stellium-SAP-Connector"] = configJson;

      currentConfig.mcpServers["cds-mcp"] = {
        "command": "npx",
        "args": ["-y", "@cap-js/mcp-server"]
      };

      let projectsRoot = path.join(os.homedir(), "cap-projects");
      if (fs.existsSync(ENV_FILE)) {
        const envConfig = dotenv.parse(fs.readFileSync(ENV_FILE));
        if (envConfig.PROJECTS_ROOT && envConfig.PROJECTS_ROOT.trim() !== "") {
          projectsRoot = envConfig.PROJECTS_ROOT.trim();
        }
      }
      projectsRoot = path.resolve(projectsRoot);

      currentConfig.mcpServers["filesystem"] = {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          projectsRoot
        ]
      };

      currentConfig.mcpServers["Fiori-mcp"] = {
        "type": "stdio",
        "timeout": 600,
        "command": "npx",
        "args": ["--yes", "@sap-ux/fiori-mcp-server@latest", "fiori-mcp"]
      };

      fs.writeFileSync(claudeConfigPath, JSON.stringify(currentConfig, null, 2));
      return { success: true, path: claudeConfigPath };
    } else {
      return { success: false };
    }
  });

  ipcMain.handle('authenticate-mcp', async (event, username, password) => {
    try {
      const response = await fetch('https://mcp.cfapps.ap21.hana.ondemand.com/api/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      return { success: data && data.status === 'access success', data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('test-abap-connection', async (event, config) => {
    try {
      const { ADTClient, session_types } = require('abap-adt-api');
      const client = new ADTClient(
        config.SAP_URL,
        config.SAP_USER,
        config.SAP_PASSWORD,
        config.SAP_CLIENT || '',
        config.SAP_LANGUAGE || 'EN'
      );
      client.stateful = session_types.stateless;
      await client.login();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('test-cap-connection', async (event, config) => {
    try {
      const response = await fetch(`${config.CF_API}/v3`, { method: 'GET' });
      if (response.ok) {
        return { success: true };
      }
      return { success: false, error: 'Could not reach CF API' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('fetch-skills', async (event, username, password) => {
    try {
      const response = await fetch('https://mcp.cfapps.ap21.hana.ondemand.com/api/skills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      return { success: response.ok, data: data, error: response.ok ? null : (data.message || 'Error fetching skills') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('test-github-connection', async (event, config) => {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${config.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Koeber-Stellium-Connector'
        }
      });
      if (response.ok) {
        return { success: true };
      }
      return { success: false, error: 'Invalid GitHub Token' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
