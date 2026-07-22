import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CodexInvocationOptions } from "./types.js";

export interface CodexModelOptions {
  models: string[];
  defaultModel: string;
  defaultReasoningEffort: CodexInvocationOptions["reasoningEffort"];
}

const fallbackModel = "gpt-5.3-codex";
const reasoningEfforts = new Set<CodexInvocationOptions["reasoningEffort"]>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
]);

function configuredValue(config: string, key: string): string | undefined {
  const match = new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, "m").exec(config);
  return match?.[1]?.trim();
}

export function readCodexModelOptions(paths: {
  cachePath?: string;
  configPath?: string;
} = {}): CodexModelOptions {
  const codexRoot = path.join(os.homedir(), ".codex");
  const cachePath = paths.cachePath || path.join(codexRoot, "models_cache.json");
  const configPath = paths.configPath || path.join(codexRoot, "config.toml");
  const config = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const configuredModel = configuredValue(config, "model") || fallbackModel;
  const configuredReasoning = configuredValue(config, "model_reasoning_effort") as CodexInvocationOptions["reasoningEffort"] | undefined;
  const defaultReasoningEffort = configuredReasoning && reasoningEfforts.has(configuredReasoning)
    ? configuredReasoning
    : "medium";
  const discovered: string[] = [];

  if (existsSync(cachePath)) {
    try {
      const cache = JSON.parse(readFileSync(cachePath, "utf8")) as {
        models?: Array<{ slug?: unknown }>;
      };
      for (const model of cache.models || []) {
        if (typeof model.slug === "string" && model.slug.trim()) {
          discovered.push(model.slug.trim());
        }
      }
    } catch {
      // An invalid cache should not prevent setup; the configured model remains available.
    }
  }

  const discoveredModels = discovered.filter((value, index, values) => values.indexOf(value) === index);
  const models = discoveredModels.length > 0
    ? discoveredModels
    : [configuredModel];
  const defaultModel = models.includes(configuredModel) ? configuredModel : models[0] || fallbackModel;

  return {
    models: defaultModel === models[0]
      ? models
      : [defaultModel, ...models.filter((model) => model !== defaultModel)],
    defaultModel,
    defaultReasoningEffort
  };
}

export function isReasoningEffort(value: string): value is CodexInvocationOptions["reasoningEffort"] {
  return reasoningEfforts.has(value as CodexInvocationOptions["reasoningEffort"]);
}
