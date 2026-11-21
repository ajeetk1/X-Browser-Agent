const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const children = new Set();
let stopping = false;

function launch(command, args, cwd = root, label) {
  const child = spawn(command, args, { cwd, stdio: 'ignore' });
  children.add(child);
  child.once('error', error => {
    children.delete(child);
    if (!stopping) console.error(`${label} could not start: ${error.message}`);
  });
  child.once('exit', code => { children.delete(child); if (!stopping && code !== 0) console.error(`${label} stopped (${code ?? 'signal'}); retrying.`); });
  return child;
}

async function responds(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(800) })).ok; }
  catch { return false; }
}

async function supervise(url, command, args, cwd, label) {
  while (!stopping) {
    if (await responds(url)) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }
    if (![...children].some(child => child.__serviceLabel === label)) {
      const child = launch(command, args, cwd, label);
      child.__serviceLabel = label;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

async function main() {
  const uvicorn = path.join(root, 'backend/.venv/bin/uvicorn');
  await Promise.all([
    supervise('http://127.0.0.1:5173/', process.execPath,
      [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], root, 'Dashboard'),
    supervise('http://127.0.0.1:8000/api/health',
    require('node:fs').existsSync(uvicorn) ? uvicorn : 'python3',
    require('node:fs').existsSync(uvicorn)
      ? ['app.main:app', '--host', '127.0.0.1', '--port', '8000']
      : ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
    path.join(root, 'backend'), 'Local API')
  ]);
}

function stop() {
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
main().catch(error => { console.error(error.message); stop(); process.exitCode = 1; });
