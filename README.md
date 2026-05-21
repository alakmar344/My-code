# eSAMz Code

Full-stack AI coding agent for web browsers and mobile phones.

## Features

- Gemini-powered autonomous coding loop (plan → execute → observe → retry)
- Auto self-correction with up to 5 retries and visible retry status
- In-browser terminal UI with xterm.js and streaming execution output
- Virtual in-memory file system with create/edit/delete/rename
- Mobile-first React + Tailwind layout with bottom-sheet terminal and floating actions
- Session context persistence in localStorage with context trimming near 100k tokens

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

## Backend Setup

```bash
cd backend
npm install
npm run start
```

Backend default URL: `http://localhost:8080`

### Sandbox execution

The backend executes code via Docker with restricted resources and disabled network:

- `--network none`
- CPU/memory/pids limits
- isolated temp workspace mount

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Using the App

1. Open **Settings** and enter your Gemini API key (never hardcoded).
2. Send a natural language coding task in chat.
3. The agent will:
   - plan and write files
   - execute code automatically
   - observe output/errors
   - retry with self-correction up to 5 attempts
4. Continue iterating in chat.

## Deploy

- Frontend: Vercel
- Backend: Railway/Render (Docker required for sandbox execution)

## Security Notes

- API key is user-supplied in browser settings.
- No server-side session persistence by default.
- Code execution is isolated in Docker containers.
