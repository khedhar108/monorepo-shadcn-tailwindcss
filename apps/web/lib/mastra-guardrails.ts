export type NormalizedChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type NormalizedChatRequest = {
  agentId: string;
  messages: NormalizedChatMessage[];
  memory?: {
    thread?: string;
    resource?: string;
  };
  requestContext?: Record<string, string>;
};

type GuardrailDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
      status: number;
    };

const MAX_MESSAGES_PER_REQUEST = 20;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 24_000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
const ALLOWED_REQUEST_CONTEXT_KEYS = new Set(["llmModel", "llmProvider"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTextFromMessage(message: Record<string, unknown>): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.parts)) {
    return "";
  }

  return message.parts
    .flatMap((part) => {
      if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") {
        return [];
      }

      return [part.text];
    })
    .join("");
}

function normalizeMessages(rawMessages: unknown): NormalizedChatMessage[] {
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  return rawMessages.slice(-MAX_MESSAGES_PER_REQUEST).flatMap((rawMessage) => {
    if (!isRecord(rawMessage)) {
      return [];
    }

    const role = rawMessage.role;
    if (role !== "system" && role !== "user" && role !== "assistant") {
      return [];
    }

    const content = extractTextFromMessage(rawMessage).trim();
    if (!content) {
      return [];
    }

    return [{ role, content }];
  });
}

function normalizeMemory(rawMemory: unknown): NormalizedChatRequest["memory"] {
  if (!isRecord(rawMemory)) {
    return undefined;
  }

  const memory: NonNullable<NormalizedChatRequest["memory"]> = {};

  if (typeof rawMemory.thread === "string" && SAFE_ID_PATTERN.test(rawMemory.thread)) {
    memory.thread = rawMemory.thread;
  }

  if (typeof rawMemory.resource === "string" && SAFE_ID_PATTERN.test(rawMemory.resource)) {
    memory.resource = rawMemory.resource;
  }

  return Object.keys(memory).length > 0 ? memory : undefined;
}

function normalizeRequestContext(rawRequestContext: unknown): Record<string, string> | undefined {
  if (!isRecord(rawRequestContext)) {
    return undefined;
  }

  const requestContext: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawRequestContext)) {
    if (!ALLOWED_REQUEST_CONTEXT_KEYS.has(key) || typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0 && trimmed.length <= 160) {
      requestContext[key] = trimmed;
    }
  }

  return Object.keys(requestContext).length > 0 ? requestContext : undefined;
}

export function normalizeChatRequest(rawBody: unknown, fallbackAgentId: string): NormalizedChatRequest {
  const body = isRecord(rawBody) ? rawBody : {};
  const agentId = typeof body.agentId === "string" ? body.agentId : fallbackAgentId;

  return {
    agentId,
    messages: normalizeMessages(body.messages),
    memory: normalizeMemory(body.memory),
    requestContext: normalizeRequestContext(body.requestContext),
  };
}

export async function runInputGuardrails(
  request: NormalizedChatRequest,
): Promise<GuardrailDecision> {
  if (request.messages.length === 0) {
    return {
      allowed: false,
      reason: "Message is required.",
      status: 400,
    };
  }

  const totalChars = request.messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return {
      allowed: false,
      reason: "Message is too large.",
      status: 413,
    };
  }

  if (request.messages.some((message) => message.content.length > MAX_MESSAGE_CHARS)) {
    return {
      allowed: false,
      reason: "A single message is too large.",
      status: 413,
    };
  }

  return { allowed: true };
}

export async function runOutputGuardrails(_part: unknown): Promise<GuardrailDecision> {
  // Add output policy checks here before streamed parts are written to the UI.
  return { allowed: true };
}
