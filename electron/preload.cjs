const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('xAgent', {
  toggleBrowser: () => ipcRenderer.invoke('x-browser:toggle'),
  openX: () => ipcRenderer.invoke('x-browser:open'),
  readThread: (postId) => ipcRenderer.invoke('x-browser:read-thread', { postId }),
  scanVisiblePosts: () => ipcRenderer.invoke('x-browser:scan-visible-posts'),
  discover: (query) => ipcRenderer.invoke('x-browser:discover', query),
  publishApprovedReply: (suggestionId) => ipcRenderer.invoke('x-browser:publish-approved', suggestionId),
  openPost: (url) => ipcRenderer.invoke('x-browser:open-post', url),
  pauseAgent: () => ipcRenderer.invoke('agent:pause'),
  resumeAgent: () => ipcRenderer.invoke('agent:resume'),
});
