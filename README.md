# X Browser Agent

An Electron desktop workspace for discovering X conversations, researching context in a signed-in ChatGPT browser, and using Gemini to score and draft human-reviewed replies. X and ChatGPT each use a persistent Electron browser session. The app does not use the X API or read browser cookies or credentials.

## Run locally

Requirements: Node.js 20+ and Python 3.10+.

```sh
npm install
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cp .env.example backend/.env
# Set GEMINI_API_KEY in backend/.env. ChatGPT uses its browser session; no OpenAI API key is needed.
npm run desktop
```

This starts the React dashboard, local API, and Electron desktop app together. The browser-only dashboard at `http://127.0.0.1:5173` is a visual preview; X login and browser-based ChatGPT research require Electron. Sign in yourself through **Sign in to X** and **Sign in to ChatGPT** in Electron; each service has its own persistent browser session and account. In **Discover**, choose **Search X & research** to search your saved topics, or enter an optional keyword. The app searches X automatically, then **Research with ChatGPT → Draft with Gemini** opens the selected conversation and visible thread in the ChatGPT browser, collects a concise research note, and sends that note and the thread context to Gemini for scoring and drafting. A **Rephrase with ChatGPT** action can smooth the draft while preserving its point and your saved voice. No OpenAI API key is needed.

Gemini needs `GEMINI_API_KEY` in `backend/.env`. Keys are only read by Python; never add them to `src/` or frontend build settings. ChatGPT research uses the visible browser session after you sign in normally.

## Current behavior

- The dashboard ships with sample cards. Live scans navigate X using saved topics and collect visible posts. Gemini decides which are worth reviewing and scores relevance, originality, and usefulness.
- ChatGPT browser research reads the post and visible thread, and can search for supporting context. Gemini uses that research, the thread, and your saved writing voice to draft a reply. **Improve flow with Gemini** preserves the meaning while smoothing the reading flow.
- Each reply requires its own **Approve & post** action. The Electron browser submits only that approved reply, then records a successful X confirmation in SQLite. No background or bulk posting is enabled.
- Duplicate or near-identical published replies are blocked. The **Emergency stop** pauses search, research, drafting, and publishing; the app records discoveries, research, decisions, and publishing in Activity History.
- X and ChatGPT login use ordinary visible browser forms. The user completes any login or verification; the app does not imitate human input to evade platform controls.
- X page controls can change. If X does not confirm a post, check the conversation in the embedded browser before retrying.
- The local database is `backend/signal.db` by default. It stores app research and decisions, never X passwords, cookies, or tokens.

## API

FastAPI docs are available at `http://127.0.0.1:8000/docs`. Health, settings, research, suggestion decisions, activity, and publishing records are under `/api`.

## Safety boundaries

Each reply requires its own **Approve & post** action. There is no background or bulk posting, liking, following, or direct messaging. The Electron browser uses normal X pages and does not bypass access controls or CAPTCHA. Review each draft before approving it.
