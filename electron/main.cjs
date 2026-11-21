const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const path = require('node:path');

let window;
let xView;
let chatGPTView;
let activeView = 'none';
let agentPaused = false;
function placeView() {
  if (!window || !xView || !chatGPTView) return;
  const { width, height } = window.getContentBounds();
  const bounds = { x: Math.floor(width * 0.58), y: 0, width: Math.floor(width * 0.42), height };
  xView.setBounds(activeView === 'x' ? bounds : { x: 0, y: 0, width: 0, height: 0 });
  chatGPTView.setBounds(activeView === 'chatgpt' ? bounds : { x: 0, y: 0, width: 0, height: 0 });
}
function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 850, minHeight: 650, backgroundColor: '#f7f8fa', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  xView = new WebContentsView({ webPreferences: { partition: 'persist:x-browser-agent', contextIsolation: true, nodeIntegration: false, sandbox: true } });
  chatGPTView = new WebContentsView({ webPreferences: { partition: 'persist:chatgpt-research', contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.contentView.addChildView(xView);
  window.contentView.addChildView(chatGPTView);
  xView.webContents.loadURL('https://x.com');
  chatGPTView.webContents.loadURL('about:blank');
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
  if (xView.webContents.getURL() === 'about:blank') await xView.webContents.loadURL('https://x.com');
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
    for (let i = 0; i < 20; i++) {
      const button = document.querySelector('[data-testid="tweetButtonInline"]') || document.querySelector('[data-testid="tweetButton"]');
      if (window.__XBA_PAUSED) return false;
      if (button && !button.disabled) { button.click(); break; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    for (let i = 0; i < 24; i++) {
      const message = [...document.querySelectorAll('[role="alert"], [data-testid="toast"]')].map(e => e.innerText).join(' ');
      if (window.__XBA_PAUSED) return false;
      if (/reply was sent|your reply was sent|posted/i.test(message)) return true;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  })()`);
  if (agentPaused) throw new Error('Emergency stop activated. Check X to see whether the reply was submitted.');
  if (!posted) throw new Error('X did not confirm the reply was posted. Check the conversation before trying again.');
  const saved = await fetch(`http://127.0.0.1:8000/api/publishing/${suggestionId}/record`, { method: 'POST' });
  const recorded = await saved.json().catch(() => ({}));
  if (!saved.ok) throw new Error(recorded.detail || 'X confirmed the reply, but the local publishing record could not be updated');
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
async function showChatGPT() {
  if (!chatGPTView) throw new Error('ChatGPT browser is not available');
  activeView = 'chatgpt';
  placeView();
  if (chatGPTView.webContents.getURL() === 'about:blank') await chatGPTView.webContents.loadURL('https://chatgpt.com');
}
ipcMain.handle('chatgpt:open', async () => { await showChatGPT(); return true; });
async function sendChatGPTPrompt(prompt) {
  if (agentPaused) throw new Error('Agent is paused. Resume it before using ChatGPT.');
  await showChatGPT();
  const before = await chatGPTView.webContents.executeJavaScript(`(() => {
    const box = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]');
    if (box) { box.focus(); return document.querySelectorAll('[data-message-author-role="assistant"]').length; }
    return -1;
  })()`);
  if (before < 0) throw new Error('Sign in to ChatGPT in its embedded browser, then retry.');
  if (agentPaused) throw new Error('Emergency stop interrupted ChatGPT.');
  chatGPTView.webContents.insertText(prompt);
  const sent = await chatGPTView.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button[data-testid="send-button"]');
    if (button && !button.disabled) { button.click(); return true; }
    return false;
  })()`);
  if (!sent) throw new Error('ChatGPT did not show its send control. Check the message and try again.');
  const answer = await chatGPTView.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 240; i++) {
      if (window.__XBA_PAUSED) return '';
      const replies = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
      const newest = replies.at(-1);
      const stop = document.querySelector('button[data-testid="stop-button"]');
      if (replies.length > ${before} && newest?.innerText?.trim() && !stop) return newest.innerText.trim();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return '';
  })()`);
  if (!answer) throw new Error('ChatGPT did not return a completed reply in time.');
  if (agentPaused) throw new Error('Emergency stop interrupted ChatGPT.');
  return answer;
}
ipcMain.handle('chatgpt:rephrase', async (_event, input) => {
  if (agentPaused) throw new Error('Agent is paused. Resume it before using ChatGPT.');
  const { tweet, reply, voice, context } = input || {};
  if (typeof tweet !== 'string' || !tweet.trim() || tweet.length > 5000 || typeof reply !== 'string' || !reply.trim() || reply.length > 1000) {
    throw new Error('A tweet and draft reply are required to rephrase.');
  }
  const stateRes = await fetch('http://127.0.0.1:8000/api/agent/state');
  if ((await stateRes.json()).paused) { agentPaused = true; throw new Error('Emergency stop is active.'); }
  const prompt = `Rewrite the draft as a natural reply to the X post. Improve the reading flow and keep the writer's voice. Preserve the point and factual meaning; do not add claims, personal experience, flattery, or a generic opening. Keep it to 40 words or fewer. Return only the revised reply, with no explanation.\n\nWRITING VOICE: ${typeof voice === 'string' ? voice.slice(0, 1000) : 'Natural, direct, and conversational.'}\n\nX POST: ${tweet.trim()}\n\n${typeof context === 'string' && context.trim() ? `RELEVANT CONTEXT: ${context.slice(0, 6000)}\n\n` : ''}DRAFT REPLY: ${reply.trim()}`;
  return { reply: await sendChatGPTPrompt(prompt) };
});
ipcMain.handle('chatgpt:research', async (_event, { postId, prompt }) => {
  if (agentPaused) throw new Error('Agent is paused. Resume it before researching.');
  if (!Number.isInteger(postId) || typeof prompt !== 'string' || !prompt.trim()) throw new Error('Research request is incomplete');
  const stateRes = await fetch('http://127.0.0.1:8000/api/agent/state');
  const state = await stateRes.json();
  if (state.paused) { agentPaused = true; throw new Error('Agent is paused. Resume it before researching.'); }
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
  const answer = await sendChatGPTPrompt(`${prompt}\n\nVISIBLE X THREAD CONTEXT:\n${JSON.stringify(threadContext)}`);
  if (agentPaused) throw new Error('Emergency stop interrupted ChatGPT research.');
  return { answer, threadContext };
});
ipcMain.handle('agent:pause', () => {
  agentPaused = true;
  if (xView && !xView.webContents.isDestroyed()) { xView.webContents.executeJavaScript('window.__XBA_PAUSED = true').catch(() => {}); xView.webContents.stop(); }
  if (chatGPTView && !chatGPTView.webContents.isDestroyed()) { chatGPTView.webContents.executeJavaScript('window.__XBA_PAUSED = true').catch(() => {}); chatGPTView.webContents.stop(); }
  return { paused: true };
});
ipcMain.handle('agent:resume', () => {
  agentPaused = false;
  if (xView && !xView.webContents.isDestroyed()) xView.webContents.executeJavaScript('window.__XBA_PAUSED = false').catch(() => {});
  if (chatGPTView && !chatGPTView.webContents.isDestroyed()) chatGPTView.webContents.executeJavaScript('window.__XBA_PAUSED = false').catch(() => {});
  return { paused: false };
});
app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
