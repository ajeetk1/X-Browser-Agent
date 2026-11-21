const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('xAgent', {
  toggleBrowser: () => ipcRenderer.invoke('x-browser:toggle'),
  openX: () => ipcRenderer.invoke('x-browser:open'),
  scanVisiblePosts: () => ipcRenderer.invoke('x-browser:scan-visible-posts'),
  discover: (query) => ipcRenderer.invoke('x-browser:discover', query),
  publishApprovedReply: (suggestionId) => ipcRenderer.invoke('x-browser:publish-approved', suggestionId),
  openPost: (url) => ipcRenderer.invoke('x-browser:open-post', url),
  openChatGPT: () => ipcRenderer.invoke('chatgpt:open'),
  chatGPTResearch: (postId, prompt) => ipcRenderer.invoke('chatgpt:research', { postId, prompt }),
  rephraseWithChatGPT: (input) => ipcRenderer.invoke('chatgpt:rephrase', input),
  pauseAgent: () => ipcRenderer.invoke('agent:pause'),
  resumeAgent: () => ipcRenderer.invoke('agent:resume'),
});
