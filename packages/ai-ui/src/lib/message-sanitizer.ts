/**
 * Message sanitizer — shared by stream filter, render filter, and persistence.
 *
 * Hides assistant text that leaked as plain prose from Llama-style models that
 * print tool calls / metadata as text instead of emitting AI SDK tool parts.
 */

export type UIMessageLike = {
  parts?: Array<{ type: string; text?: string }>;
  content?: string;
};

const METADATA_KEYS =
  /^(thread|threadId|memory|resource|agentId|userId|resourceId)$/i;

const TOOL_ARG_KEYS = /^(parameters|arguments|args|input)$/i;

// ponytail: shapes that only show up when an upstream provider error gets
// stringified and emitted as text. `name` ending in "Error" + a `stack` string
// is the universal AI SDK / Mastra error shape; `requestBodyValues` /
// `responseBody` are the leaky payload fields on AI_APICallerError.
const ERROR_NAME_KEYS = /^(name|message|stack)$/i;
const ERROR_PAYLOAD_KEYS =
  /^(requestBodyValues|responseBody|response|url|statusText|statusCode)$/i;
const ERROR_NAME_RE = /[A-Z][A-Za-z0-9_]*Error$/;

const PREAMBLE_PATTERNS = [
  /here(?:'s| is) (?:a |the )?json (?:for|to) (?:a |the )?function/i,
  /proper arguments?\b/i,
  /function(?:[- ])?call (?:json|payload|arguments)\b/i,
  /tool(?:[- ])?call (?:json|payload|arguments)\b/i,
  /i(?:'ll| will) (?:now )?(?:invoke|call|emit) (?:the )?tool\b/i,
  /```(?:json|tool_call)\b/i,
];

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON object with `name` + `parameters`/`arguments`/`args` — a tool call leaked as text. */
export function isToolCallJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return false;
  const parsed = tryParseJson(trimmed);
  if (!isPlainObject(parsed)) return false;
  const keys = Object.keys(parsed);
  if (keys.length === 0) return false;
  const hasName = typeof parsed.name === "string" && parsed.name.length > 0;
  const hasArgs = keys.some((k) => TOOL_ARG_KEYS.test(k));
  return hasName && hasArgs;
}

/** Internal Mastra/AI SDK metadata blobs: `{ threadId, memory, resource, ... }`. */
export function isInternalMetadataJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  const parsed = tryParseJson(trimmed);
  if (!isPlainObject(parsed)) return false;
  const keys = Object.keys(parsed);
  return keys.some((k) => METADATA_KEYS.test(k));
}

/**
 * Stringified upstream error object leaked as text — e.g.
 * `{"message":"Gone","name":"AI_APICallerError","stack":"...","url":"...","requestBodyValues":{...}}`.
 * NVIDIA / OpenAI-compatible providers return 410/5xx and Mastra/AI SDK stringifies
 * the error into the stream when retries are exhausted.
 */
export function isErrorJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return false;
  const parsed = tryParseJson(trimmed);
  if (!isPlainObject(parsed)) return false;
  const keys = Object.keys(parsed);
  if (keys.length === 0) return false;

  const name = typeof parsed.name === "string" ? parsed.name : "";
  const stack = typeof parsed.stack === "string" ? parsed.stack : "";
  const hasErrorName = ERROR_NAME_RE.test(name);
  const hasStack = stack.includes("at ") && /\.(ts|js|mjs|cjs):/.test(stack);
  const hasPayload = keys.some((k) => ERROR_PAYLOAD_KEYS.test(k));
  const hasErrorKeys =
    keys.filter((k) => ERROR_NAME_KEYS.test(k)).length >= 2;

  // Strong signal: error name + stack
  if (hasErrorName && hasStack) return true;
  // Error name + leaky payload fields
  if (hasErrorName && hasPayload) return true;
  // stack + message + name shape (no payload) — still an error blob
  if (hasStack && hasErrorKeys) return true;
  return false;
}

/** Truncated JSON tails — `graphKind: "exploration", limit: "10"}}` etc. */
export function isJsonFragmentLeak(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 240) return false;
  // looks like trailing JSON fragment: ends with `}}` or `}` but doesn't open with `{`
  if (!/\}\}\s*$/.test(trimmed) && !/[a-zA-Z0-9_]+:\s*["'\d]/.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith("{")) return false; // handled by tool-call/metadata checks
  // require at least one `key: value` pair and closing brace
  return /[a-zA-Z0-9_]+:\s*["'\d]/.test(trimmed) && /\}\}?\s*$/.test(trimmed);
}

/** Preambles like "Here's a JSON for a function call..." */
export function isToolCallPreambleText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 400) return false;
  return PREAMBLE_PATTERNS.some((re) => re.test(trimmed));
}

/** Union of all hide-rules. */
export function shouldHideAssistantText(text: string): boolean {
  if (!text || !text.trim()) return false;
  return (
    isToolCallJsonText(text) ||
    isInternalMetadataJsonText(text) ||
    isErrorJsonText(text) ||
    isJsonFragmentLeak(text) ||
    isToolCallPreambleText(text)
  );
}

/**
 * Drop hidden paragraphs/lines from a full assistant text blob, rejoin the rest.
 * Used at persistence time so history never stores leaked JSON.
 */
export function sanitizeAssistantText(text: string): string {
  if (!text) return "";

  // Fast path: whole-string matches → drop entirely
  if (shouldHideAssistantText(text)) return "";

  // Split on double-newlines (paragraphs), then on single newlines, drop hidden lines.
  const paragraphs = text.split(/\n{2,}/);
  const kept: string[] = [];

  for (const para of paragraphs) {
    if (shouldHideAssistantText(para)) continue;
    // Also strip individual lines that look like fragment leaks
    const lines = para.split(/\n/);
    const keptLines = lines.filter((line) => !shouldHideAssistantText(line));
    if (keptLines.length === 0) continue;
    const joined = keptLines.join("\n");
    if (joined.trim()) kept.push(joined);
  }

  return kept.join("\n\n").trim();
}

/**
 * Replaces inline `getMessageText` + filtering at render time.
 * Walks message.parts (text parts), then falls back to legacy `content`.
 * Returns the displayable string — already sanitized — or empty string.
 */
export function getDisplayableTextFromParts(
  parts: UIMessageLike["parts"] | undefined,
  legacyContent?: string,
): string {
  if (parts && parts.length > 0) {
    const joined = parts
      .filter((p) => p?.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");
    const sanitized = sanitizeAssistantText(joined);
    if (sanitized) return sanitized;
  }
  if (typeof legacyContent === "string") {
    return sanitizeAssistantText(legacyContent);
  }
  return "";
}

// ── ponytail self-check ───────────────────────────────────────────────
// Run with `node --experimental-strip-types packages/ai-ui/src/lib/message-sanitizer.ts`
// or import demo() from a test. One runnable check that fails if logic breaks.

export function demo(): void {
  const cases: Array<{ name: string; input: string; expectHidden: boolean }> = [
    {
      name: "tool-call JSON",
      input:
        '{"name": "graphQueryTool", "parameters": {"userId": "user123", "minScore": "0.5"}}',
      expectHidden: true,
    },
    {
      name: "preamble",
      input:
        "Here's a JSON for a function call with its proper arguments that best answers the given prompt:",
      expectHidden: true,
    },
    {
      name: "trailing fragment",
      input: 'graphKind: "exploration", limit: "10"}}',
      expectHidden: true,
    },
    {
      name: "metadata blob",
      input: '{"threadId": "abc", "memory": {"last": "x"}}',
      expectHidden: true,
    },
    {
      name: "upstream API error JSON",
      input:
        '{"message":"Gone","name":"AI_APICallerError","stack":"AI_APICallerError: Gone\\n    at OpenAICompatibleChatLanguageModel.doStream (D:/MajorProjectSem4/major-aria/aria/node_modules/@ai-sdk/openai-compatible/dist/index.js:123:45)","url":"https://integrate.api.nvidia.com/v1/chat/completions","requestBodyValues":{"model":"z-ai/glm-4-9b"}}',
      expectHidden: true,
    },
    {
      name: "minimal error JSON (name + stack + message)",
      input:
        '{"name":"TypeError","message":"Cannot read properties of undefined","stack":"TypeError: Cannot read properties of undefined\\n    at foo (bar.ts:1:2)"}',
      expectHidden: true,
    },
    {
      name: "real answer",
      input:
        "Loop engineering refers to the practice of designing closed-loop control systems...",
      expectHidden: false,
    },
    {
      name: "empty",
      input: "",
      expectHidden: false,
    },
  ];

  const failures: string[] = [];
  for (const c of cases) {
    const hidden = shouldHideAssistantText(c.input);
    if (hidden !== c.expectHidden) {
      failures.push(
        `${c.name}: expected ${c.expectHidden}, got ${hidden} — input: ${c.input.slice(0, 80)}`,
      );
    }
  }

  const sanitizeCases: Array<{ input: string; expectContains: string }> = [
    {
      input:
        "Here's a JSON for a function call with its proper arguments:\n\nReal answer follows here.",
      expectContains: "Real answer follows here.",
    },
  ];
  for (const c of sanitizeCases) {
    const out = sanitizeAssistantText(c.input);
    if (!out.includes(c.expectContains)) {
      failures.push(
        `sanitize lost expected text: expected "${c.expectContains}" in "${out}"`,
      );
    }
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error("message-sanitizer demo FAILED:\n" + failures.join("\n"));
    // ponytail: throw so any runner (tsx, vitest, etc.) catches it as a non-zero
    // exit. Avoids Node-specific `process.exit` / `require.main` globals so the
    // file type-checks cleanly in browser-targeted tsconfigs (no @types/node).
    throw new Error("message-sanitizer demo failed");
  }

  // eslint-disable-next-line no-console
  console.log("message-sanitizer demo passed");
}

// ponytail: runnable self-check — invoke with:
//   npx tsx -e "import('@repo/ai-ui/lib/message-sanitizer').then(m => m.demo())"
// No `require.main === module` guard so the file stays browser-tsconfig clean.
