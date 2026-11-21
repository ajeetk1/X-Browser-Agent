export {};
declare global {
  interface Window {
    xAgent?: {
      toggleBrowser: () => Promise<boolean>;
      openX: () => Promise<boolean>;
      readThread: (postId: number) => Promise<{ threadContext: string[] }>;
      scanVisiblePosts: () => Promise<Array<{ text: string; url: string; author: string }>>;
      discover: (query: string) => Promise<Array<{ text: string; url: string; author: string }>>;
      publishApprovedReply: (suggestionId: number) => Promise<{ published: boolean; count: number }>;
      pauseAgent: () => Promise<{ paused: boolean }>;
      resumeAgent: () => Promise<{ paused: boolean }>;
      openPost: (url: string) => Promise<boolean>;
    };
  }
}
