import { useState } from "react";

export default function ChatPanel({ messages, isRunning, status, onSend }) {
  const [input, setInput] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!input.trim() || isRunning) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <strong className="text-sm">Agent Chat</strong>
        <span className="text-xs text-slate-300">{status || "Idle"}</span>
      </div>

      <div className="flex-1 space-y-2 overflow-auto p-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-lg px-3 py-2 text-sm ${
              message.role === "user"
                ? "ml-8 bg-indigo-600 text-white"
                : "mr-8 bg-slate-800 text-slate-100"
            }`}
          >
            <div className="mb-1 text-[10px] uppercase opacity-70">{message.role}</div>
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="border-t border-slate-700 p-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder="Describe what you want to build..."
          className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 p-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={isRunning || !input.trim()}
          className="mt-2 w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isRunning ? "Running..." : "Send"}
        </button>
      </form>
    </div>
  );
}
