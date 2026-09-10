# eSAMz Code

**eSAMz Code** is a mobile-ready, browser-first AI coding workspace built for fast shipping.  
It combines an autonomous coding agent, sandboxed execution, and a professional IDE-style UI.

Part of the **eSAMz** product line — [esamz.me](https://esamz.me).

## Why eSAMz Code

- ⚡ **Autonomous build loop**: plan → execute → observe → retry automatically
- 🧠 **Self-correcting agent** with visible retry status and error-aware context
- 📱 **Professional mobile UX** with responsive editor, chat, file tree, and terminal
- 🔎 **Web-powered commands** with Serper search (`/search`)
- 🌐 **User-device internet terminal commands** (`/curl`, `/open`) for live research workflows
- 🔒 **Sandboxed execution** via Docker with strict runtime limits

## Core Capabilities

### AI Agent
- Gemini-powered streaming responses
- Multi-turn context memory with local session persistence
- Automatic retries (up to 5 attempts) when execution fails

### Professional Frontend
- React + Tailwind + CodeMirror + xterm.js
- Touch-friendly layout from phone screens to desktop
- Command-aware chat and terminal UX

### Safer, More Resilient Backend
- Input validation and guarded limits for execution/search endpoints
- Stream-safe NDJSON writes
- Upstream timeout control for external AI/search calls
- Graceful JSON parsing and centralized API error responses

## Architecture — how the pieces fit

```
 Browser (React + Vite)
 ├── AgentLoop.jsx      plan → execute → observe → retry (up to 5 attempts, visible status)
 ├── claudeApi.js       streaming AI calls (NDJSON over fetch)
 ├── contextManager.js  multi-turn memory, capped + persisted client-side
 ├── virtualFS.js       client-side file system the agent "works in"
 └── Terminal / CodeEditor / FileTree / ChatPanel  (xterm.js + CodeMirror)
          │  HTTP + NDJSON stream
          ▼
 Node/Express backend (server.js, 273 lines)
 ├── input validation    language allowlist (javascript/python/bash),
 │                       MAX_QUERY_LENGTH=400, MAX_MESSAGES=120, MAX_FILES=300
 ├── stream-safe writes  NDJSON with writableEnded guard
 └── executor.js         spawns docker with CPU/memory/pid limits (117 lines)
          │
          ▼
 Docker sandbox          untrusted code runs here, never on the host
```

The design principle: **the agent may write and run arbitrary code, so nothing
it touches is trusted.** Files live in a virtual FS client-side; execution goes
through a validating Express layer into a resource-capped container; results
stream back as NDJSON so the UI can render progress incrementally.

## Commands

### Chat slash commands
- `/help` — show available commands
- `/search <query>` — run web search through Serper API

### Terminal commands (browser internet from user device)
- `/help`
- `/search <query>`
- `/curl <https://url>` — fetch URL content using browser network
- `/open <https://url>` — open URL in a new tab

> Note: Browser internet commands depend on CORS policies of target websites.

## Project Structure

```
/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Terminal.jsx
│   │   │   ├── CodeEditor.jsx
│   │   │   ├── FileTree.jsx
│   │   │   ├── ChatPanel.jsx
│   │   │   └── AgentLoop.jsx
│   │   ├── lib/
│   │   │   ├── claudeApi.js
│   │   │   ├── virtualFS.js
│   │   │   └── contextManager.js
│   │   └── App.jsx
├── backend/
│   ├── server.js
│   ├── executor.js
│   └── Dockerfile
└── README.md
```

## Quick Start

### 1) Backend
```bash
cd backend
npm install
npm start
```
Backend default URL: `http://localhost:8080`

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend default URL: `http://localhost:5173`

## Settings You Must Provide

From the Settings modal in the app:
- Gemini API key (for AI generation)
- Serper API key (for `/search`)
- Backend URL (default: `http://localhost:8080`)

No API key is hardcoded in source.

## Deployment

- **Frontend**: Vercel
- **Backend**: Railway/Render (Docker-capable environment required)
  - Backend must support Docker runtime for sandbox execution.
  - If mounting `/var/run/docker.sock`, treat it as security-sensitive infrastructure.
  - Use isolated infrastructure for production reliability and safety.

## Security & Reliability Notes

- Code execution runs in isolated containers with CPU/memory/pid limits.
- Backend applies request validation and timeout protection for external calls.
- Session context is stored client-side in localStorage (no default server-side session DB).
