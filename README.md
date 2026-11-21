# X Browser Agent

An Electron desktop workspace for discovering X conversations, using Gemini to research context to score and draft human-reviewed replies. X uses a persistent Electron browser session; Gemini runs through the local backend API. The app does not use the X API or read browser cookies or credentials.

## Run locally

Requirements: Node.js 20+ and Python 3.10+.

```sh
npm install
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cp .env.example backend/.env
# Set GEMINI_API_KEY in backend/.env. No ChatGPT login or OpenAI API key is used.
npm run desktop
```

This starts the React dashboard, local API, and Electron desktop app together, reusing either service if it is already running. Use one command: `npm run desktop` (or `npm start`). The browser-only dashboard at `http://127.0.0.1:5173` is a visual preview; a normal Chrome page cannot launch a desktop app when a button is clicked. X login requires Electron. Sign in through **Sign in to X**; Gemini research and reply generation use the `GEMINI_API_KEY` configured in the local backend. In **Discover**, choose **Search X & draft replies** to search your saved topics and watched handles, or enter an optional keyword. The app reads each discovered conversation in Electron and prepares up to 20 worthwhile drafts for the **Suggestions** queue. No OpenAI API key is needed.

To keep the Chrome preview and local API available after you close Electron and across Mac restarts, run `npm run autostart:install` once. It installs a per-user macOS LaunchAgent that starts and monitors the services at login. Remove it with `npm run autostart:uninstall`. Electron remains separate and is only needed for X sign-in and live discovery.

Gemini needs `GEMINI_API_KEY` in `backend/.env`. Keys are only read by Python; never add them to `src/` or frontend build settings. Gemini uses its API key from the local backend; no ChatGPT account or API key is needed.

## Current behavior

- The dashboard ships with sample cards. Live scans navigate X using saved topics and collect visible posts. Gemini decides which are worth reviewing and scores relevance, originality, and usefulness.
- Gemini analyzes the post and visible thread, scores the conversation, and drafts replies automatically after a search, up to the 20-item review queue limit. Low-value posts are skipped. **Improve flow with Gemini** preserves the meaning while smoothing the reading flow.
- Each reply requires its own **Approve & post** action. The Electron browser submits only that approved reply, then records a successful X confirmation in SQLite. No background or bulk posting is enabled.
- Duplicate or near-identical published replies are blocked. The **Emergency stop** pauses search, research, drafting, and publishing; the app records discoveries, research, decisions, and publishing in Activity History.
- X login uses the ordinary visible browser form. The user completes any login or verification; the app does not imitate human input to evade platform controls.
- X page controls can change. If X does not confirm a post, check the conversation in the embedded browser before retrying.
- The local database is `backend/signal.db` by default. It stores app research and decisions, never X passwords, cookies, or tokens.

## API

FastAPI docs are available at `http://127.0.0.1:8000/docs`. Health, settings, research, suggestion decisions, activity, and publishing records are under `/api`.

## Safety boundaries

Each reply requires its own **Approve & post** action. There is no background or bulk posting, liking, following, or direct messaging. The Electron browser uses normal X pages and does not bypass access controls or CAPTCHA. Review each draft before approving it.
