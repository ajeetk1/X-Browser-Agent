export {};
declare global {
  interface Window {
    xAgent?: {
      toggleBrowser: () => Promise<boolean>;
      scanVisiblePosts: () => Promise<Array<{ text: string; url: string; author: string }>>;
      discover: (query: string) => Promise<Array<{ text: string; url: string; author: string }>>;
      publishApprovedReply: (suggestionId: number) => Promise<{ published: boolean; count: number }>;
      openChatGPT: () => Promise<boolean>;
      chatGPTResearch: (postId: number, prompt: string) => Promise<{ answer: string; threadContext: string[] }>;
      pauseAgent: () => Promise<{ paused: boolean }>;
      resumeAgent: () => Promise<{ paused: boolean }>;
      openPost: (url: string) => Promise<boolean>;
    };
  }
}
