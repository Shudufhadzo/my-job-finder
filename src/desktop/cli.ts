import {
  getDesktopState,
  configureDesktopProfile,
  readRunState,
  runDesktopRefresh,
  runDesktopReprocess
} from "./desktop-service.js";
import type { DesktopProfileInput } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const command = process.argv[2] || "state";

try {
  if (command === "state") {
    writeJson({ ok: true, state: getDesktopState(), run: readRunState() });
  } else if (command === "configure") {
    const input = JSON.parse(await readStdin()) as DesktopProfileInput;
    const profile = await configureDesktopProfile(input);
    writeJson({ ok: true, profile, state: getDesktopState() });
  } else if (command === "refresh" || command === "reprocess" || command === "reprocess-local") {
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = (...values: unknown[]) => process.stderr.write(`${values.join(" ")}\n`);
    console.warn = (...values: unknown[]) => process.stderr.write(`${values.join(" ")}\n`);
    try {
      const state = command === "refresh"
        ? await runDesktopRefresh({}, (runEvent) => writeJson({ event: runEvent }))
        : await runDesktopReprocess(
            {},
            (runEvent) => writeJson({ event: runEvent }),
            { localOnly: command === "reprocess-local" }
          );
      writeJson({ ok: true, state });
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }
  } else {
    throw new Error(`Unknown desktop command: ${command}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeJson({ ok: false, error: message });
  process.exitCode = 1;
}
