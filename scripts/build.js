/**
 * build.js - Electron build wrapper for Windows.
 *
 *  1. Run `tsc` to compile TypeScript.
 *  2. Run electron-builder --win dir into %TEMP%\mcp-abap-build (no NSIS/7zip).
 *  3. Wait 15s for Windows Defender to finish scanning the new files.
 *  4. Zip win-unpacked using PowerShell, retrying up to 3 times.
 *  5. Copy ONLY the zip back into release_build/.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT       = path.resolve(__dirname, '..');
const TMP_OUT    = path.join(os.tmpdir(), 'mcp-abap-build-v2');
const WIN_UNPACK = path.join(TMP_OUT, 'win-unpacked');
const FINAL_OUT  = path.join(ROOT, 'release_build');
const TMP_CONFIG = path.join(os.tmpdir(), 'eb-config-override.json');
const ZIP_NAME   = 'MCP-ABAP-ADT-API-win-x64.zip';
const ZIP_TMP    = path.join(TMP_OUT, ZIP_NAME);
const ZIP_FINAL  = path.join(FINAL_OUT, ZIP_NAME);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  const r = spawnSync(cmd, { shell: true, cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`Command failed (exit ${r.status})`);
}

async function main() {
  // ── 1. TypeScript ──────────────────────────────────────────────────────────
  console.log('\n📦 Step 1: TypeScript build...');
  run('npx tsc -p tsconfig.json');
  console.log('✅ TypeScript done.');

  // ── 2. electron-builder --win dir → %TEMP% ────────────────────────────────
  fs.mkdirSync(TMP_OUT, { recursive: true });
  fs.mkdirSync(FINAL_OUT, { recursive: true });

  if (fs.existsSync(WIN_UNPACK)) {
    fs.rmSync(WIN_UNPACK, { recursive: true, force: true });
    console.log('🧹 Cleaned stale win-unpacked from %TEMP%.');
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const baseBuild = pkg.build || {};
  const override = {
    ...baseBuild,
    directories: { ...(baseBuild.directories || {}), output: TMP_OUT },
    win: { target: 'dir' },
  };
  fs.writeFileSync(TMP_CONFIG, JSON.stringify(override, null, 2));

  console.log(`\n🔨 Step 2: electron-builder --win dir → ${TMP_OUT}`);
  const env = {
    ...process.env,
    ELECTRON_BUILDER_CACHE: path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'cache'),
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  };

  const eb = spawnSync(
    `npx electron-builder --win dir --config "${TMP_CONFIG}"`,
    [], { shell: true, cwd: ROOT, stdio: 'inherit', env }
  );
  try { fs.unlinkSync(TMP_CONFIG); } catch (_) {}

  if (eb.status !== 0) {
    console.error(`\n❌ electron-builder failed (exit ${eb.status})`);
    process.exit(eb.status || 1);
  }
  console.log('✅ electron-builder done.');

  // ── 3. Wait for Windows Defender to release its scan lock ─────────────────
  const WAIT_SEC = 15;
  process.stdout.write(`\n⏳ Waiting ${WAIT_SEC}s for Windows Defender to finish scanning...`);
  await sleep(WAIT_SEC * 1000);
  console.log(' done.');

  // ── 4. Zip with PowerShell, retry up to 3 times ───────────────────────────
  let zipped = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n📦 Step 3 (attempt ${attempt}/3): Zipping → ${ZIP_TMP}`);
    if (fs.existsSync(ZIP_TMP)) fs.unlinkSync(ZIP_TMP);

    const psZip = spawnSync(
      'tar',
      ['-a', '-c', '-f', ZIP_TMP, '-C', WIN_UNPACK, '*'],
      { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] }
    );

    if (fs.existsSync(ZIP_TMP) && fs.statSync(ZIP_TMP).size > 10240) {
      const mb = (fs.statSync(ZIP_TMP).size / 1024 / 1024).toFixed(1);
      console.log(`✅ Zip created (${mb} MB).`);
      zipped = true;
      break;
    }

    if (attempt < 3) {
      console.warn(`⚠️  Attempt ${attempt} failed (zip missing or empty). Waiting 10s...`);
      await sleep(10000);
    }
  }

  if (!zipped) {
    console.error(`\n❌ Failed to create zip after 3 attempts.`);
    console.error(`   The unpacked app is at: ${WIN_UNPACK}\\MCP ABAP ADT API.exe`);
    console.error('   You can run it directly from there.');
    process.exit(1);
  }

  // ── 5. Copy zip to release_build/ (only a .zip — Defender won't lock it) ──
  console.log(`\n📋 Step 4: Copying zip → ${ZIP_FINAL}`);
  fs.copyFileSync(ZIP_TMP, ZIP_FINAL);

  console.log(`
🎉 Build complete!

   📦  ${ZIP_FINAL}

   Extract the zip and run:
   • Double-click  "MCP ABAP ADT API.exe"          → config GUI
   • Run with arg  "MCP ABAP ADT API.exe" --server  → MCP stdio server

   Claude Desktop (claude_desktop_config.json):
   {
     "mcpServers": {
       "mcp-abap": {
         "command": "<extracted-folder>\\MCP ABAP ADT API.exe",
         "args": ["--server"]
       }
     }
   }
`);
}

main().catch(err => {
  console.error('\nBuild error:', err.message);
  process.exit(1);
});
