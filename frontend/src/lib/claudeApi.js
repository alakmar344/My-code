const parseNDJSONStream = async (response, onEvent, signal) => {
  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed));
      } catch {
        // ignore malformed chunks
      }
    }
  }
};

export const streamAgentResponse = async ({
  backendUrl,
  apiKey,
  model,
  systemPrompt,
  messages,
  onToken,
  signal
}) => {
  const response = await fetch(`${backendUrl}/api/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      apiKey,
      model,
      systemPrompt,
      messages
    })
  });

  await parseNDJSONStream(response, (event) => {
    if (event.type === "error") throw new Error(event.data);
    if (event.type === "token") onToken?.(event.data);
  });
};

export const executeCode = async ({ backendUrl, language, command, files, onEvent, signal }) => {
  const response = await fetch(`${backendUrl}/api/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ language, command, files })
  });

  let exitCode = 1;

  await parseNDJSONStream(response, (event) => {
    onEvent?.(event);
    if (event.type === "exit") exitCode = event.exitCode ?? 1;
    if (event.type === "error") throw new Error(event.data);
  }, signal);

  return exitCode;
};

export const searchWeb = async ({ backendUrl, serperApiKey, query, signal }) => {
  const response = await fetch(`${backendUrl}/api/web/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ serperApiKey, query })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Search failed: ${response.status}`);
  }

  return response.json();
};
