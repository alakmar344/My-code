import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RUNNERS = {
  javascript: {
    image: "node:20-alpine",
    fallbackCommand: "node index.js"
  },
  python: {
    image: "python:3.11-alpine",
    fallbackCommand: "python main.py"
  },
  bash: {
    image: "bash:5.2",
    fallbackCommand: "bash main.sh"
  }
};

const writeFiles = async (baseDir, files) => {
  const entries = Object.entries(files || {});
  for (const [relativePath, content] of entries) {
    const safePath = relativePath.replace(/^\/+/, "");
    const absolutePath = path.join(baseDir, safePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content ?? "", "utf8");
  }
};

export const executeInSandbox = async ({
  language,
  command,
  files,
  timeoutMs = 20000,
  onStdout,
  onStderr
}) => {
  const runner = RUNNERS[language];
  if (!runner) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "esamz-sandbox-"));
  await writeFiles(tempDir, files);

  const dockerArgs = [
    "run",
    "--rm",
    "--network",
    "none",
    "--cpus",
    "0.5",
    "--memory",
    "256m",
    "--pids-limit",
    "128",
    "-v",
    `${tempDir}:/workspace`,
    "-w",
    "/workspace",
    runner.image,
    "sh",
    "-lc",
    command?.trim() ? command : runner.fallbackCommand
  ];

  return new Promise((resolve, reject) => {
    const child = spawn("docker", dockerArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => onStdout?.(chunk.toString()));
    child.stderr.on("data", (chunk) => onStderr?.(chunk.toString()));

    child.on("error", async (error) => {
      clearTimeout(timeout);
      settled = true;
      await fs.rm(tempDir, { recursive: true, force: true });
      reject(error);
    });

    child.on("close", async (exitCode, signal) => {
      clearTimeout(timeout);
      settled = true;
      await fs.rm(tempDir, { recursive: true, force: true });
      resolve({ exitCode: exitCode ?? 1, signal });
    });
  });
};
