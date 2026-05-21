import { useMemo, useRef, useState } from "react";
import { executeCode, streamAgentResponse } from "../lib/claudeApi";
import { buildAgentContext, trimContext } from "../lib/contextManager";

const AGENT_SYSTEM_PROMPT = `You are eSAMz Code, an autonomous coding agent.
Follow this strict loop: plan -> execute -> observe -> retry.
Return valid JSON only, without markdown code fences:
{
  "plan": ["short step"],
  "files": [{"path": "file path", "content": "full file content"}],
  "language": "javascript|python|bash",
  "command": "command to run",
  "summary": "what changed and why"
}
If no file updates are needed, return an empty files array.
Always use full file content when writing files.
When previous attempts failed, fix based on terminal errors.`;

const extractJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    // Continue with relaxed parsing
  }

  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not include JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
};

export function useAgentLoop({
  backendUrl,
  model,
  apiKey,
  fsApi,
  messages,
  setMessages,
  terminalLog,
  appendTerminal
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Idle");
  const abortRef = useRef(null);

  const api = useMemo(
    () => ({
      isRunning,
      status,
      stopExecution: () => {
        abortRef.current?.abort();
        setStatus("Stopped");
        setIsRunning(false);
      },
      runTask: async (task) => {
        if (!task?.trim() || isRunning) return;
        if (!apiKey?.trim()) {
          setStatus("Missing API key");
          return;
        }

        const newMessages = [...messages, { role: "user", content: task }];
        setMessages(newMessages);

        const errorHistory = [];
        setIsRunning(true);

        for (let attempt = 1; attempt <= 5; attempt += 1) {
          abortRef.current = new AbortController();
          setStatus(`Planning and coding (attempt ${attempt}/5)`);

          const attemptContext = buildAgentContext({
            messages: trimContext(newMessages, 100000),
            files: fsApi.getSnapshot(),
            terminalLog,
            errorHistory
          });

          const prompt = `User task: ${task}\n\nSession context JSON:\n${JSON.stringify(
            attemptContext
          )}`;

          let rawResponse = "";
          const draftMessage = { role: "assistant", content: "" };

          setMessages((current) => [...current, draftMessage]);

          try {
            await streamAgentResponse({
              backendUrl,
              apiKey,
              model,
              systemPrompt: AGENT_SYSTEM_PROMPT,
              messages: [...newMessages, { role: "user", content: prompt }],
              signal: abortRef.current.signal,
              onToken: (token) => {
                rawResponse += token;
                setMessages((current) => {
                  const cloned = [...current];
                  const last = cloned[cloned.length - 1];
                  if (last?.role === "assistant") {
                    cloned[cloned.length - 1] = {
                      ...last,
                      content: (last.content || "") + token
                    };
                  }
                  return cloned;
                });
              }
            });

            const parsed = extractJson(rawResponse);
            fsApi.applyAgentFileWrites(parsed.files || []);

            const language = parsed.language || "javascript";
            const command = parsed.command || "";

            setStatus(`Executing code (attempt ${attempt}/5)`);
            appendTerminal(`\n$ ${command || "(no command)"}\n`);

            const exitCode = await executeCode({
              backendUrl,
              language,
              command,
              files: fsApi.getSnapshot(),
              signal: abortRef.current.signal,
              onEvent: (event) => {
                if (event.type === "stdout") appendTerminal(event.data);
                if (event.type === "stderr") appendTerminal(event.data);
              }
            });

            if (exitCode === 0) {
              setStatus("Success");
              setMessages((current) => [
                ...current,
                { role: "assistant", content: parsed.summary || "✅ Task completed successfully." }
              ]);
              setIsRunning(false);
              return;
            }

            const retryMessage = `❌ Error detected → 🔄 Retrying (attempt ${Math.min(
              attempt + 1,
              5
            )}/5)...`;
            errorHistory.push({ attempt, rawResponse, terminalTail: terminalLog.slice(-4000) });
            setMessages((current) => [...current, { role: "assistant", content: retryMessage }]);
            setStatus(retryMessage);
          } catch (error) {
            if (error.name === "AbortError") {
              setMessages((current) => [...current, { role: "assistant", content: "⏹️ Execution stopped." }]);
              setIsRunning(false);
              return;
            }

            const retryMessage = `❌ Error detected: ${error.message} → 🔄 Retrying (attempt ${Math.min(
              attempt + 1,
              5
            )}/5)...`;
            errorHistory.push({ attempt, error: error.message, terminalTail: terminalLog.slice(-4000) });
            setMessages((current) => [...current, { role: "assistant", content: retryMessage }]);
            setStatus(retryMessage);
          }
        }

        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: "I reached the retry limit (5/5). Please refine the task or provide guidance."
          }
        ]);
        setStatus("Retry limit reached");
        setIsRunning(false);
      }
    }),
    [apiKey, appendTerminal, backendUrl, fsApi, isRunning, messages, model, setMessages, status, terminalLog]
  );

  return api;
}

export default function AgentLoop({ children, ...props }) {
  const api = useAgentLoop(props);
  return children(api);
}
