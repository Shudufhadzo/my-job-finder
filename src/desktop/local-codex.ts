import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureDirectory } from "../utils.js";
import type { CodexInvocationOptions, ProcessInvocation } from "./types.js";

function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCodexInvocation(options: CodexInvocationOptions): ProcessInvocation {
  const codexArgs = [
    "exec",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--output-schema",
    options.schemaPath,
    "--output-last-message",
    options.outputPath,
    "-m",
    options.model,
    "-c",
    `model_reasoning_effort=\"${options.reasoningEffort}\"`,
    "-s",
    "read-only",
    "-"
  ];

  if (options.platform === "win32" && /\.(?:cmd|bat)$/i.test(options.executable)) {
    const command = [quoteForCmd(options.executable), ...codexArgs.map(quoteForCmd)].join(" ");
    return { file: "cmd.exe", args: ["/d", "/s", "/c", `"${command}"`] };
  }

  if (/\.js$/i.test(options.executable)) {
    return { file: process.execPath, args: [options.executable, ...codexArgs] };
  }

  return { file: options.executable, args: codexArgs };
}

function resolveCodexEntrypoint(found: string): string {
  if (!/\.cmd$/i.test(found)) return found;
  const scriptPath = path.join(
    path.dirname(found),
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js"
  );
  return existsSync(scriptPath) ? scriptPath : found;
}

export function findCodexExecutable(platform = process.platform): string {
  const pathCommand = platform === "win32" ? "where.exe" : "which";
  const executableNames = platform === "win32" ? ["codex.cmd", "codex.exe"] : ["codex"];

  for (const executableName of executableNames) {
    try {
      const output = execFileSync(pathCommand, [executableName], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const found = output.split(/\r?\n/).map((value) => value.trim()).find((value) => value && existsSync(value));
      if (found) {
        return resolveCodexEntrypoint(found);
      }
    } catch {
      // Try the next executable name or a standard install location.
    }
  }

  const candidates = platform === "win32"
    ? [
        path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js"),
        path.join(process.env.APPDATA || "", "npm", "codex.cmd"),
        path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "codex.exe")
      ]
    : ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", path.join(os.homedir(), ".local", "bin", "codex")];
  const candidate = candidates.find((value) => value && existsSync(value));
  if (!candidate) {
    throw new Error("Codex CLI was not found. Install Codex and sign in before running job analysis.");
  }
  return candidate;
}

export function assertCodexAuthenticated(): void {
  const authPath = path.join(os.homedir(), ".codex", "auth.json");
  if (!existsSync(authPath)) {
    throw new Error("No authenticated Codex session was found. Sign in to Codex, then try again.");
  }

  const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>;
  if (!auth.tokens && !auth.OPENAI_API_KEY) {
    throw new Error("The local Codex session is not authenticated. Sign in to Codex, then try again.");
  }
}

export async function runCodexJson<T>(options: {
  prompt: string;
  schema: object;
  workingDirectory: string;
  model?: string;
  reasoningEffort?: CodexInvocationOptions["reasoningEffort"];
  timeoutMs?: number;
  executable?: string;
}): Promise<T> {
  assertCodexAuthenticated();
  const tempRoot = path.join(os.tmpdir(), "my-job-finder");
  ensureDirectory(tempRoot);
  const token = `${process.pid}-${Date.now()}`;
  const schemaPath = path.join(tempRoot, `schema-${token}.json`);
  const outputPath = path.join(tempRoot, `output-${token}.json`);
  writeFileSync(schemaPath, JSON.stringify(options.schema, null, 2), "utf8");

  const invocation = buildCodexInvocation({
    platform: process.platform,
    executable: options.executable || findCodexExecutable(),
    schemaPath,
    outputPath,
    model: options.model || "gpt-5.3-codex",
    reasoningEffort: options.reasoningEffort || "medium"
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const processHandle = spawn(invocation.file, invocation.args, {
        cwd: options.workingDirectory,
        stdio: ["pipe", "ignore", "pipe"],
        windowsHide: true
      });
      let stderr = "";
      const timer = setTimeout(() => {
        processHandle.kill();
        reject(new Error("Codex analysis timed out."));
      }, options.timeoutMs || 8 * 60 * 1000);

      processHandle.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      processHandle.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      processHandle.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Codex analysis failed with exit code ${code}: ${stderr.trim().slice(0, 800)}`));
        }
      });
      processHandle.stdin.end(options.prompt);
    });

    if (!existsSync(outputPath)) {
      throw new Error("Codex completed without producing structured output.");
    }
    return JSON.parse(readFileSync(outputPath, "utf8")) as T;
  } finally {
    for (const filePath of [schemaPath, outputPath]) {
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch {
        // Temporary cleanup is best effort.
      }
    }
  }
}
