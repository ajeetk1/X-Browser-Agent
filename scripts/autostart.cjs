const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform !== 'darwin') {
  console.error('Automatic login startup is currently configured for macOS only.');
  process.exit(1);
}

const label = 'com.ajeet.xbrowseragent.local-services';
const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
const root = path.resolve(__dirname, '..');
const uid = process.getuid();
const service = path.join(root, 'scripts', 'local-services.cjs');
const logs = path.join(os.homedir(), 'Library', 'Logs');

function launchctl(...args) {
  try { execFileSync('/bin/launchctl', args, { stdio: 'ignore' }); }
  catch (error) { if (args[0] !== 'bootout') throw error; }
}

if (process.argv[2] === 'uninstall') {
  launchctl('bootout', `gui/${uid}`, plist);
  fs.rmSync(plist, { force: true });
  console.log('Removed X Browser Agent login startup.');
} else if (process.argv[2] === 'install') {
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.mkdirSync(logs, { recursive: true });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${service}</string></array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(logs, 'x-browser-agent.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logs, 'x-browser-agent.log')}</string>
</dict></plist>
`;
  fs.writeFileSync(plist, xml, { mode: 0o600 });
  launchctl('bootout', `gui/${uid}`, plist);
  launchctl('bootstrap', `gui/${uid}`, plist);
  launchctl('kickstart', '-k', `gui/${uid}/${label}`);
  console.log('X Browser Agent dashboard and API will start at login and restart if they stop.');
  console.log('Open http://127.0.0.1:5173/ in Chrome. Electron is only needed for X sign-in and live discovery.');
} else {
  console.error('Usage: npm run autostart:install | npm run autostart:uninstall');
  process.exit(2);
}
