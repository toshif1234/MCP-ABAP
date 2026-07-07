import fs from 'fs';
import path from 'path';
import os from 'os';

const AUTH_API_URL = 'https://mcp.cfapps.ap21.hana.ondemand.com/api/authenticate';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheFilePath(): string {
  const dir = path.join(os.homedir(), '.mcp-abap-abap-adt-api');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'auth-cache.json');
}

export async function authenticateMcpUser(): Promise<void> {
  const username = process.env.MCP_USERNAME;
  const password = process.env.MCP_PASSWORD;

  if (!username || !password) {
    throw new Error('MCP credentials are not configured. Please set MCP_USERNAME and MCP_PASSWORD in your environment configuration.');
  }

  const cachePath = getCacheFilePath();

  // 1. Check cache
  if (fs.existsSync(cachePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cacheData.timestamp && cacheData.status === 'access success') {
        const now = Date.now();
        const age = now - cacheData.timestamp;
        if (age < CACHE_DURATION_MS) {
          // Cache is valid
          return;
        }
      }
    } catch (e) {
      // Ignore cache parse errors and just re-authenticate
    }
  }

  // 2. Call API
  let response;
  try {
    response = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });
  } catch (e: any) {
    throw new Error(`Authentication failed. Your MCP account is not authorized. Please verify your credentials or contact the administrator. (Network Error: ${e.message})`);
  }

  // 3. Validate response
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error('Authentication failed. Your MCP account is not authorized. Please verify your credentials or contact the administrator. (Invalid response format)');
  }

  if (data && data.status === 'access success') {
    // 4. Update cache
    try {
      fs.writeFileSync(cachePath, JSON.stringify({
        status: 'access success',
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Failed to write auth cache:', e);
      // We don't fail authentication just because caching failed
    }
    return;
  }

  throw new Error('Authentication failed. Your MCP account is not authorized. Please verify your credentials or contact the administrator.');
}
