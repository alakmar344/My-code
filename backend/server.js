import express from "express";
import cors from "cors";
import { executeInSandbox } from "./executor.js";

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

const writeNdjson = (res, payload) => {
  res.write(`${JSON.stringify(payload)}\n`);
};

const prepareStreamResponse = (res) => {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/execute", async (req, res) => {
  prepareStreamResponse(res);

  const { language, command, files } = req.body || {};

  try {
    const result = await executeInSandbox({
      language,
      command,
      files,
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

  const {
    apiKey,
    model = "gemini-2.5-flash",
    systemPrompt,
    messages,
    maxOutputTokens = 4096,
    temperature = 0.2
  } = req.body || {};

  if (!apiKey) {
    writeNdjson(res, { type: "error", data: "Missing API key" });
    return res.end();
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: systemPrompt
            ? { parts: [{ text: String(systemPrompt) }] }
            : undefined,
          contents: toGeminiContents(messages),
          generationConfig: {
            temperature,
            maxOutputTokens
          }
        })
      }
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

app.listen(port, () => {
  console.log(`eSAMz Code backend running on :${port}`);
});
