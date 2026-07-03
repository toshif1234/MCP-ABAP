/**
 * server-entry.js — Pure Node.js entry point for the MCP server.
 *
 * This file is designed to be run with `node` (or with electron.exe +
 * ELECTRON_RUN_AS_NODE=1), NOT as an Electron app. This guarantees
 * zero Chromium/GPU diagnostic output on stdout, which would corrupt
 * the MCP JSON-RPC stream.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');

// Load saved env vars from ~/.mcp-abap-abap-adt-api/.env
const ENV_FILE = path.join(os.homedir(), '.mcp-abap-abap-adt-api', '.env');
if (fs.existsSync(ENV_FILE)) {
  dotenv.config({ path: ENV_FILE });
}

// Start the MCP server (reads stdin, writes stdout — clean JSON-RPC)
require('../dist/index.js');
