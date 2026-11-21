const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const children = new Set();
let stopping = false;

function start(command, args, cwd = root) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function responds(url, validate = response => response.ok) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800) });
    return validate(response);
  } catch {
    return false;
  }
}

async function waitFor(url, label, child) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (stopping) throw new Error('Startup cancelled');
    if (child.exitCode !== null) throw new Error(`${label} stopped before it was ready`);
    if (await responds(url)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function main() {
  if (!await responds('http://127.0.0.1:5173/')) {
    console.log('Starting dashboard…');
    const vite = start(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1']);
    await waitFor('http://127.0.0.1:5173/', 'Dashboard', vite);
  } else {
    console.log('Using dashboard already running at http://127.0.0.1:5173');
  }

  if (!await responds('http://127.0.0.1:8000/api/health', response => response.ok)) {
    console.log('Starting local API…');
    const venvUvicorn = path.join(root, 'backend/.venv/bin/uvicorn');
    const backend = require('node:fs').existsSync(venvUvicorn)
      ? start(venvUvicorn, ['app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'], path.join(root, 'backend'))
      : start('python3', ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'], path.join(root, 'backend'));
    await waitFor('http://127.0.0.1:8000/api/health', 'Local API', backend);
  } else {
    console.log('Using API already running at http://127.0.0.1:8000');
  }

  console.log('Opening X Browser Agent…');
  // Launch Electron's native executable directly. Launching electron/cli.js first
  // leaves the native app orphaned when this supervisor stops on macOS.
  const electronBinary = require('electron');
  const electron = start(electronBinary, ['.']);
  electron.once('exit', code => {
    if (!stopping) stop(code || 0);
  });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
main().catch(error => {
  if (error.message !== 'Startup cancelled') console.error(error.message);
  stop(error.message === 'Startup cancelled' ? 0 : 1);
});
