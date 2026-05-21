import { useEffect, useMemo, useRef, useState } from "react";
import AgentLoop from "./components/AgentLoop";
import ChatPanel from "./components/ChatPanel";
import CodeEditor from "./components/CodeEditor";
import FileTree from "./components/FileTree";
import Terminal from "./components/Terminal";
import { loadSession, saveSession } from "./lib/contextManager";
import { executeCode } from "./lib/claudeApi";
import { createVirtualFS, inferLanguageFromPath } from "./lib/virtualFS";

const defaultSession = {
  messages: [
    {
      role: "assistant",
      content:
        "Hi, I am eSAMz Code. Give me a coding task and I will plan, execute, observe output, and retry automatically if needed."
    }
  ],
  selectedFile: "/index.js",
  apiKey: "",
  model: "gemini-2.5-flash",
  backendUrl: "http://localhost:8080"
};

function SettingsModal({ open, settings, onChange, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl bg-slate-900 p-4">
        <h2 className="mb-3 text-lg font-semibold">Settings</h2>
        <div className="space-y-3">
          <label className="block text-sm">
            Gemini API Key
            <input
              type="password"
              value={settings.apiKey}
              onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2"
              placeholder="AIza..."
            />
          </label>
          <label className="block text-sm">
            Gemini Model
            <input
              value={settings.model}
              onChange={(event) => onChange({ ...settings, model: event.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2"
            />
          </label>
          <label className="block text-sm">
            Backend URL
            <input
              value={settings.backendUrl}
              onChange={(event) => onChange({ ...settings, backendUrl: event.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded bg-slate-700 px-3 py-2" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const stored = loadSession();

  const fsApi = useMemo(() => createVirtualFS(stored?.files), [stored?.files]);
  const [tree, setTree] = useState(fsApi.listTree());
  const [selectedFile, setSelectedFile] = useState(stored?.selectedFile || defaultSession.selectedFile);
  const [editorValue, setEditorValue] = useState(() => {
    try {
      return fsApi.readFile(stored?.selectedFile || defaultSession.selectedFile);
    } catch {
      return "";
    }
  });
  const [messages, setMessages] = useState(stored?.messages || defaultSession.messages);
  const [terminalLog, setTerminalLog] = useState(stored?.terminalLog || "");
  const [clearSignal, setClearSignal] = useState(0);
  const [settings, setSettings] = useState({
    apiKey: stored?.apiKey || defaultSession.apiKey,
    model: stored?.model || defaultSession.model,
    backendUrl: stored?.backendUrl || defaultSession.backendUrl
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [terminalExpanded, setTerminalExpanded] = useState(false);

  const refreshTree = () => setTree(fsApi.listTree());

  useEffect(() => {
    try {
      setEditorValue(fsApi.readFile(selectedFile));
    } catch {
      setEditorValue("");
    }
  }, [fsApi, selectedFile]);

  useEffect(() => {
    saveSession({
      ...settings,
      messages,
      selectedFile,
      terminalLog,
      files: fsApi.getSnapshot()
    });
  }, [fsApi, messages, selectedFile, settings, terminalLog]);

  const appendTerminal = (chunk) => {
    setTerminalLog((current) => current + chunk);
  };

  const onEditorChange = (nextText) => {
    setEditorValue(nextText);
    fsApi.writeFile(selectedFile, nextText);
    refreshTree();
  };

  const createFile = (basePath = "/") => {
    const name = window.prompt("File name (example: app.js)");
    if (!name) return;
    const cleanBase = basePath === "/" ? "" : basePath.replace(/\/$/, "");
    const path = `${cleanBase}/${name}`.replace(/\/+/g, "/");
    fsApi.writeFile(path, "");
    setSelectedFile(path);
    refreshTree();
  };

  const createFolder = (basePath = "/") => {
    const name = window.prompt("Folder name");
    if (!name) return;
    const cleanBase = basePath === "/" ? "" : basePath.replace(/\/$/, "");
    fsApi.createFolder(`${cleanBase}/${name}`.replace(/\/+/g, "/"));
    refreshTree();
  };

  const renamePath = (path) => {
    const name = window.prompt("New path", path);
    if (!name || name === path) return;
    fsApi.renamePath(path, name);
    if (selectedFile === path) setSelectedFile(name);
    refreshTree();
  };

  const deletePath = (path) => {
    if (!window.confirm(`Delete ${path}?`)) return;
    fsApi.removePath(path);
    if (selectedFile === path) setSelectedFile("/index.js");
    refreshTree();
  };

  const runCurrentFile = async () => {
    const language = inferLanguageFromPath(selectedFile);
    const commandMap = {
      javascript: `node ${selectedFile.replace(/^\//, "")}`,
      python: `python ${selectedFile.replace(/^\//, "")}`,
      bash: `bash ${selectedFile.replace(/^\//, "")}`
    };

    appendTerminal(`\n$ ${commandMap[language]}\n`);

    await executeCode({
      backendUrl: settings.backendUrl,
      language,
      command: commandMap[language],
      files: fsApi.getSnapshot(),
      onEvent: (event) => {
        if (event.type === "stdout") appendTerminal(event.data);
        if (event.type === "stderr") appendTerminal(event.data);
      }
    });
  };

  const touchStartYRef = useRef(0);

  return (
    <AgentLoop
      backendUrl={settings.backendUrl}
      model={settings.model}
      apiKey={settings.apiKey}
      fsApi={fsApi}
      messages={messages}
      setMessages={setMessages}
      terminalLog={terminalLog}
      appendTerminal={appendTerminal}
    >
      {({ runTask, isRunning, status, stopExecution }) => (
        <div className="flex h-full flex-col gap-2 bg-slate-950 p-2 text-slate-100 md:p-3">
          <header className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
            <div>
              <h1 className="text-lg font-bold">eSAMz Code</h1>
              <p className="text-xs text-slate-400">AI coding agent for web + mobile</p>
            </div>
            <button
              className="rounded bg-slate-800 px-3 py-2 text-sm"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
          </header>

          <main className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[220px_1fr_340px]">
            <aside className="min-h-0">
              <FileTree
                tree={tree}
                selectedPath={selectedFile}
                onSelect={setSelectedFile}
                onCreateFile={createFile}
                onCreateFolder={createFolder}
                onRename={renamePath}
                onDelete={deletePath}
              />
            </aside>

            <section className="min-h-0 rounded-lg border border-slate-700 bg-slate-900 p-2">
              <div className="mb-2 text-xs text-slate-300">Editing: {selectedFile}</div>
              <div className="h-[40vh] min-h-[220px] md:h-[calc(100%-1.5rem)]">
                <CodeEditor filePath={selectedFile} value={editorValue} onChange={onEditorChange} />
              </div>
            </section>

            <section className="min-h-0">
              <ChatPanel messages={messages} isRunning={isRunning} status={status} onSend={runTask} />
            </section>
          </main>

          <section
            className={`fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border border-slate-700 bg-slate-900 p-2 transition-all md:static md:h-52 md:rounded-lg ${
              terminalExpanded ? "h-[55dvh]" : "h-24"
            }`}
            onTouchStart={(event) => {
              touchStartYRef.current = event.touches[0].clientY;
            }}
            onTouchEnd={(event) => {
              const diff = touchStartYRef.current - event.changedTouches[0].clientY;
              if (diff > 24) setTerminalExpanded(true);
              if (diff < -24) setTerminalExpanded(false);
            }}
          >
            <div className="mb-2 text-xs text-slate-300">Terminal</div>
            <div className="h-[calc(100%-1.5rem)]">
              <Terminal output={terminalLog} clearSignal={clearSignal} />
            </div>
          </section>

          <div className="pointer-events-none fixed bottom-28 right-3 z-50 flex flex-col gap-2 md:bottom-4">
            <button
              className="pointer-events-auto rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold"
              onClick={runCurrentFile}
              title="Run"
            >
              Run
            </button>
            <button
              className="pointer-events-auto rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold"
              onClick={stopExecution}
              title="Stop"
            >
              Stop
            </button>
            <button
              className="pointer-events-auto rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold"
              onClick={() => createFile("/")}
              title="New File"
            >
              New File
            </button>
            <button
              className="pointer-events-auto rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold"
              onClick={() => {
                setTerminalLog("");
                setClearSignal((x) => x + 1);
              }}
              title="Clear"
            >
              Clear
            </button>
          </div>

          <SettingsModal
            open={settingsOpen}
            settings={settings}
            onChange={setSettings}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}
    </AgentLoop>
  );
}
