const SESSION_KEY = "esamz_code_session_v1";
const DEFAULT_MAX_TOKENS = 100000;

export const estimateTokens = (text) => Math.ceil((text || "").length / 4);

const stringifyMessage = (message) => `${message.role}: ${message.content}`;

export const trimContext = (messages, maxTokens = DEFAULT_MAX_TOKENS) => {
  let current = [...messages];
  let tokenCount = estimateTokens(current.map(stringifyMessage).join("\n"));

  if (tokenCount <= maxTokens) return current;

  const keepTailCount = Math.max(8, Math.floor(current.length / 2));
  const oldTurns = current.slice(0, current.length - keepTailCount);
  const newTurns = current.slice(current.length - keepTailCount);

  const summary = oldTurns
    .map((turn, index) => `#${index + 1} ${turn.role}: ${String(turn.content).slice(0, 300)}`)
    .join("\n");

  current = [
    {
      role: "system",
      content:
        "Previous conversation summary due to context trimming:\n" +
        summary.slice(0, 6000)
    },
    ...newTurns
  ];

  tokenCount = estimateTokens(current.map(stringifyMessage).join("\n"));
  if (tokenCount > maxTokens) {
    current = current.slice(-20);
  }

  return current;
};

export const buildAgentContext = ({ messages, files, terminalLog, errorHistory }) => ({
  messages,
  files,
  terminalLog: terminalLog.slice(-12000),
  errorHistory: errorHistory.slice(-5)
});

export const loadSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveSession = (session) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage failures
  }
};
