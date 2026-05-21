import express from "express";
import cors from "cors";
import { executeInSandbox } from "./executor.js";

const app = express();
const port = process.env.PORT || 8080;
const SUPPORTED_LANGUAGES = new Set(["javascript", "python", "bash"]);
const MAX_QUERY_LENGTH = 400;
const MAX_MESSAGES = 120;
const MAX_FILES = 300;

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const writeNdjson = (res, payload) => {
  if (res.writableEnded) return;
  try {
    res.write(`${JSON.stringify(payload)}\n`);
  } catch {
    // no-op: stream might already be closed
  }
};

const prepareStreamResponse = (res) => {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
};

const ensureNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const normalizeFiles = (files) => {
  if (!files || typeof files !== "object" || Array.isArray(files)) return {};
  const entries = Object.entries(files).slice(0, MAX_FILES);
  return Object.fromEntries(
    entries.map(([key, value]) => [String(key), typeof value === "string" ? value : String(value ?? "")])
  );
};

const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-MAX_MESSAGES).filter((message) => {
    return message && ensureNonEmptyString(message.role) && ensureNonEmptyString(message.content);
  });
};

const withTimeout = async (promiseFactory, timeoutMs = 25000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/execute", async (req, res) => {
  prepareStreamResponse(res);

  const { language, command, files } = req.body || {};
  const safeLanguage = String(language || "").toLowerCase();

  try {
    if (!SUPPORTED_LANGUAGES.has(safeLanguage)) {
      writeNdjson(res, {
        type: "error",
        data: "Unsupported language. Use one of: javascript, python, bash."
      });
      writeNdjson(res, { type: "exit", exitCode: 1, signal: null });
      return res.end();
    }

    const result = await executeInSandbox({
      language: safeLanguage,
      command: ensureNonEmptyString(command) ? command : "",
      files: normalizeFiles(files),
      onStdout: (data) => writeNdjson(res, { type: "stdout", data }),
      onStderr: (data) => writeNdjson(res, { type: "stderr", data })
    });

    writeNdjson(res, {
      type: "exit",
      exitCode: result.exitCode,
      signal: result.signal || null
    });
    res.end();
  } catch (error) {
    writeNdjson(res, { type: "error", data: error.message || "Execution failed" });
    writeNdjson(res, { type: "exit", exitCode: 1, signal: null });
    res.end();
  }
});

const toGeminiContents = (messages = []) =>
  messages
    .filter((message) => message?.role && message?.content)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content) }]
    }));

app.post("/api/agent/stream", async (req, res) => {
  prepareStreamResponse(res);

  const { apiKey, model = "gemini-2.5-flash", systemPrompt, messages } = req.body || {};
  const maxOutputTokens = Math.min(8192, Math.max(256, Number(req.body?.maxOutputTokens) || 4096));
  const temperature = Math.min(1, Math.max(0, Number(req.body?.temperature) || 0.2));

  if (!ensureNonEmptyString(apiKey)) {
    writeNdjson(res, { type: "error", data: "Missing API key" });
    return res.end();
  }

  try {
    const response = await withTimeout(
      (signal) =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
              system_instruction: ensureNonEmptyString(systemPrompt)
                ? { parts: [{ text: String(systemPrompt) }] }
                : undefined,
              contents: toGeminiContents(normalizeMessages(messages)),
              generationConfig: {
                temperature,
                maxOutputTokens
              }
            })
          }
        ),
      30000
    );

    if (!response.ok || !response.body) {
      const body = await response.text();
      writeNdjson(res, {
        type: "error",
        data: `Gemini request failed: ${response.status} ${body}`
      });
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const dataLine = event
          .split("\n")
          .find((line) => line.startsWith("data:"));

        if (!dataLine) continue;

        const data = dataLine.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        let payload;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }

        const parts = payload?.candidates?.[0]?.content?.parts ?? [];
        const text = parts
          .map((part) => part?.text)
          .filter(Boolean)
          .join("");

        if (text) {
          writeNdjson(res, { type: "token", data: text });
        }
      }
    }

    writeNdjson(res, { type: "done" });
    res.end();
  } catch (error) {
    writeNdjson(res, { type: "error", data: error.message || "Agent request failed" });
    res.end();
  }
});

app.post("/api/web/search", async (req, res) => {
  const { serperApiKey, query } = req.body || {};

  if (!ensureNonEmptyString(serperApiKey)) {
    return res.status(400).json({ error: "Missing Serper API key" });
  }
  if (!ensureNonEmptyString(query)) {
    return res.status(400).json({ error: "Missing search query" });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return res
      .status(400)
      .json({ error: `Query is too long. Keep it under ${MAX_QUERY_LENGTH} characters.` });
  }

  try {
    const response = await withTimeout(
      (signal) =>
        fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": serperApiKey
          },
          signal,
          body: JSON.stringify({ q: query, num: 5, autocorrect: true })
        }),
      15000
    );

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Serper request failed",
        details: payload
      });
    }

    return res.json({
      query,
      organic: Array.isArray(payload?.organic) ? payload.organic.slice(0, 5) : [],
      knowledgeGraph: payload?.knowledgeGraph || null,
      answerBox: payload?.answerBox || null
    });
  } catch (error) {
    return res.status(502).json({
      error: "Web search failed",
      details: error.message || "Unknown upstream error"
    });
  }
});

app.use((err, _req, res, _next) => {
  const message = err?.type === "entity.parse.failed" ? "Invalid JSON payload" : "Server error";
  res.status(err?.status || 500).json({ error: message });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`eSAMz Code backend running on :${port}`);
});
