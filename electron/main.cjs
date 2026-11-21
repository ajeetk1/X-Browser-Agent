const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const path = require('node:path');

let window;
let xView;
let activeView = 'x';
let agentPaused = false;
let xLoadPromise;
function placeView() {
  if (!window || !xView) return;
  const { width, height } = window.getContentBounds();
  const bounds = { x: Math.floor(width * 0.58), y: 0, width: Math.floor(width * 0.42), height };
  xView.setBounds(activeView === 'x' ? bounds : { x: 0, y: 0, width: 0, height: 0 });
}
async function waitForXContent() {
  return xView.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 24; i++) {
      if (document.body?.innerText?.trim().length > 20) return true;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  })()`);
}
function showXLoadError(error) {
  if (!xView || xView.webContents.isDestroyed()) return;
  const message = String(error?.message || 'X could not be loaded').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#000;color:#fff;font:15px -apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center}.box{max-width:340px;padding:28px}h1{font-size:24px}p{color:#aaa;line-height:1.5}button{border:0;border-radius:18px;padding:10px 18px;font-weight:600;cursor:pointer}</style><div class="box"><h1>X didn’t finish loading</h1><p>${message}</p><p>Check your internet connection, then click retry.</p><button onclick="location.href='https://x.com'">Retry X</button></div>`;
  void xView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
}
async function bestEffort(promise, label) {
  await Promise.race([
    promise.catch(error => console.warn(`${label} failed:`, error.message)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ]);
}
function loadXWithRecovery() {
  if (xLoadPromise) return xLoadPromise;
  xLoadPromise = (async () => {
    await xView.webContents.loadURL('https://x.com');
    if (await waitForXContent()) return;
    console.warn('X loaded an empty shell. Clearing only X cache and service-worker storage, keeping sign-in cookies.');
    await bestEffort(xView.webContents.session.clearCache(), 'X cache cleanup');
    await bestEffort(xView.webContents.session.clearStorageData({ origin: 'https://x.com', storages: ['serviceworkers', 'cachestorage'] }), 'X service-worker cleanup');
    await xView.webContents.loadURL('https://x.com');
    if (!await waitForXContent()) throw new Error('X is still showing a blank loading screen. Check your connection to x.com and try again.');
  })().finally(() => { xLoadPromise = undefined; });
  return xLoadPromise;
}
function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 850, minHeight: 650, backgroundColor: '#f7f8fa', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  xView = new WebContentsView({ webPreferences: { partition: 'persist:x-browser-agent', contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.contentView.addChildView(xView);
  xView.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) console.error(`X page load failed (${code}): ${description} — ${url}`);
  });
  xView.webContents.on('did-finish-load', () => {
    xView.webContents.executeJavaScript(`({title:document.title,readyState:document.readyState,bodyTextLength:document.body?.innerText?.trim().length||0,hasMain:!!document.querySelector('main'),hasLogin:!!document.querySelector('[data-testid="loginButton"]'),articleCount:document.querySelectorAll('article').length})`)
      .then(state => console.log('X page ready:', JSON.stringify(state)))
      .catch(error => console.error('Could not inspect loaded X page:', error.message));
  });
  xView.webContents.on('render-process-gone', (_event, details) => console.error('X renderer exited:', JSON.stringify(details)));
  void loadXWithRecovery().catch(error => { console.error('Could not load X:', error.message); showXLoadError(error); });
  placeView();
  void loadDashboard();
  window.on('resize', placeView);
  window.on('closed', () => { window = null; xView = null; });
}
async function loadDashboard() {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!window || window.isDestroyed()) return;
    try {
      await Promise.all([
        fetch('http://127.0.0.1:5173/').then(response => { if (!response.ok) throw new Error('Dashboard is not ready'); }),
        fetch('http://127.0.0.1:8000/api/health').then(response => { if (!response.ok) throw new Error('API is not ready'); }),
      ]);
      await window.loadURL('http://127.0.0.1:5173');
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  console.error('Could not load the local dashboard at http://127.0.0.1:5173');
}
ipcMain.handle('x-browser:toggle', () => {
  activeView = activeView === 'x' ? 'none' : 'x';
  placeView();
  return activeView === 'x';
});
ipcMain.handle('x-browser:open', async () => {
  if (!xView) throw new Error('X browser is not available');
  activeView = 'x';
  placeView();
  if (window && !window.isDestroyed()) { window.show(); window.focus(); }
  try { await loadXWithRecovery(); }
  catch (error) { showXLoadError(error); throw error; }
  xView.webContents.focus();
  return true;
});
ipcMain.handle('x-browser:scan-visible-posts', async () => {
  if (!xView) throw new Error('X browser is not available');
  return xView.webContents.executeJavaScript(`(() => {
    const articles = [...document.querySelectorAll('article')];
    const unique = new Map();
    for (const article of articles) {
      const rect = article.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) continue;
      const text = article.querySelector('[data-testid="tweetText"]')?.innerText?.trim();
      const link = [...article.querySelectorAll('a[href*="/status/"]')].map(a => a.href).find(h => /\/status\/\d+/.test(h));
      if (!text || text.length < 20 || !link || unique.has(link)) continue;
      const authorLine = article.innerText.split('\\n').find(line => line.includes('@')) || '';
      const handle = authorLine.match(/@[A-Za-z0-9_]+/)?.[0] || 'X user';
      unique.set(link, { text, url: link, author: handle });
    }
    return [...unique.values()].slice(0, 8);
  })()`);
});
ipcMain.handle('x-browser:discover', async (_event, query) => {
  if (agentPaused) throw new Error('Agent is paused. Resume it before searching X.');
  const stateResponse = await fetch('http://127.0.0.1:8000/api/agent/state');
  if ((await stateResponse.json()).paused) { agentPaused = true; throw new Error('Emergency stop is active. Resume the agent before searching.'); }
  if (typeof query !== 'string' || !query.trim()) throw new Error('Enter a keyword or topic to research');
  if (!xView) throw new Error('X browser is not available');
  const search = new URL('https://x.com/search');
  search.searchParams.set('q', query.trim());
  search.searchParams.set('src', 'typed_query');
  search.searchParams.set('f', 'live');
  activeView = 'x';
  placeView();
  await xView.webContents.loadURL(search.toString());
  const results = await xView.webContents.executeJavaScript(`(async () => {
    const collect = () => {
      const unique = new Map();
      for (const article of document.querySelectorAll('article')) {
        const rect = article.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
        const text = article.querySelector('[data-testid="tweetText"]')?.innerText?.trim();
        const url = [...article.querySelectorAll('a[href*="/status/"]')].map(a => a.href).find(h => /\\/status\\/\\d+/.test(h));
        if (!text || text.length < 20 || !url || unique.has(url)) continue;
        const authorLine = article.innerText.split('\\n').find(line => line.includes('@')) || '';
        const author = authorLine.match(/@[A-Za-z0-9_]+/)?.[0] || 'X user';
        unique.set(url, { text, url, author });
      }
      return [...unique.values()].slice(0, 8);
    };
    for (let i = 0; i < 30; i++) { const posts = collect(); if (posts.length) return posts; await new Promise(resolve => setTimeout(resolve, 500)); }
    return collect();
  })()`);
  if (agentPaused) throw new Error('Emergency stop interrupted X search.');
  return results;
});
ipcMain.handle('x-browser:publish-approved', async (_event, suggestionId) => {
  if (agentPaused) throw new Error('Emergency stop is active. Resume the agent before posting.');
  if (!Number.isInteger(suggestionId)) throw new Error('Invalid approved reply');
  const api = await fetch(`http://127.0.0.1:8000/api/publishing/${suggestionId}/payload`);
  const payload = await api.json().catch(() => ({}));
  if (!api.ok) throw new Error(payload.detail || 'Could not verify this reply approval');
  const url = new URL(payload.url);
  if (!['x.com', 'www.x.com'].includes(url.hostname)) throw new Error('Reply link is not an X post');
  activeView = 'x';
  placeView();
  await xView.webContents.loadURL(url.toString());
  const ready = await xView.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 24; i++) {
      const article = [...document.querySelectorAll('article')].find(a => a.querySelector('[data-testid="tweetText"]'));
      if (article) {
        const reply = article.querySelector('[data-testid="reply"]') || document.querySelector('[data-testid="reply"]');
        if (reply) { reply.click(); return true; }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  })()`);
  if (!ready) throw new Error('X did not show a reply button. Check that you are signed in and can reply to this post.');
  const composer = await xView.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 20; i++) {
      const box = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (box) { box.focus(); return true; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    return false;
  })()`);
  if (!composer) throw new Error('X did not open the reply composer');
  if (agentPaused) throw new Error('Emergency stop stopped the reply before it was submitted.');
  xView.webContents.insertText(payload.text);
  const posted = await xView.webContents.executeJavaScript(`(async () => {
    const expectedReply = ${JSON.stringify(payload.text)}.trim();
    for (let i = 0; i < 20; i++) {
      const button = document.querySelector('[data-testid="tweetButtonInline"]') || document.querySelector('[data-testid="tweetButton"]');
      if (window.__XBA_PAUSED) return false;
      if (button && !button.disabled) { button.click(); break; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    for (let i = 0; i < 24; i++) {
      const message = [...document.querySelectorAll('[role="alert"], [data-testid="toast"]')].map(e => e.innerText).join(' ');
      const replyVisible = [...document.querySelectorAll('[data-testid="tweetText"]')].some(e => e.innerText.trim() === expectedReply);
      if (window.__XBA_PAUSED) return false;
      if (/reply was sent|your reply was sent|posted/i.test(message) || replyVisible) return true;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  })()`);
  if (agentPaused) throw new Error('Emergency stop activated. Check X to see whether the reply was submitted.');
  if (!posted) throw new Error('X did not confirm the reply was posted. Check the conversation before trying again.');
  let saved;
  let recorded = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      saved = await fetch(`http://127.0.0.1:8000/api/publishing/${suggestionId}/record`, { method: 'POST' });
      recorded = await saved.json().catch(() => ({}));
      if (saved.ok) break;
    } catch (error) { recorded = { detail: error.message }; }
    await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
  }
  if (!saved?.ok) throw new Error(recorded.detail || 'X confirmed the reply, but the local publishing record could not be updated');
  return { published: true, count: recorded.count };
});
ipcMain.handle('x-browser:open-post', async (_event, url) => {
  const parsed = new URL(url);
  if (parsed.hostname !== 'x.com' && parsed.hostname !== 'www.x.com') throw new Error('Only x.com links are allowed');
  await xView.webContents.loadURL(parsed.toString());
  activeView = 'x';
  placeView();
  return true;
});
ipcMain.handle('x-browser:read-thread', async (_event, { postId }) => {
  if (agentPaused) throw new Error('Agent is paused. Resume it before researching.');
  if (!Number.isInteger(postId)) throw new Error('Research request is incomplete');
  const stateRes = await fetch('http://127.0.0.1:8000/api/agent/state');
  if ((await stateRes.json()).paused) { agentPaused = true; throw new Error('Emergency stop is active.'); }
  const postRes = await fetch(`http://127.0.0.1:8000/api/posts/${postId}`);
  const post = await postRes.json().catch(() => ({}));
  if (!postRes.ok) throw new Error(post.detail || 'Could not load the conversation');
  const postUrl = new URL(post.url);
  if (!['x.com', 'www.x.com'].includes(postUrl.hostname)) throw new Error('Conversation URL is not an X post');
  activeView = 'x';
  placeView();
  await xView.webContents.loadURL(postUrl.toString());
  const threadContext = await xView.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 20; i++) {
      if (window.__XBA_PAUSED) return [];
      const items = [...document.querySelectorAll('article')].filter(a => a.querySelector('[data-testid="tweetText"]'));
      if (items.length) return items.slice(0, 8).map(a => a.querySelector('[data-testid="tweetText"]')?.innerText?.trim()).filter(Boolean);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    return [];
  })()`);
  if (agentPaused) throw new Error('Emergency stop interrupted research.');
  if (!threadContext.length) throw new Error('Could not read the visible conversation. Check your X login and try again.');
  return { threadContext };
});
ipcMain.handle('agent:pause', () => {
  agentPaused = true;
  if (xView && !xView.webContents.isDestroyed()) { xView.webContents.executeJavaScript('window.__XBA_PAUSED = true').catch(() => {}); xView.webContents.stop(); }
  return { paused: true };
});
ipcMain.handle('agent:resume', () => {
  agentPaused = false;
  if (xView && !xView.webContents.isDestroyed()) xView.webContents.executeJavaScript('window.__XBA_PAUSED = false').catch(() => {});
  return { paused: false };
});
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window || window.isDestroyed()) return createWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    activeView = 'x';
    placeView();
    void loadXWithRecovery().catch(showXLoadError);
  });
  app.whenReady().then(createWindow);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
