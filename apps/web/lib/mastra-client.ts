import { toAISdkStream } from "@mastra/ai-sdk";
import { MastraClient } from "@mastra/client-js";
import {
  runOutputGuardrails,
  type NormalizedChatMessage,
} from "./mastra-guardrails";
import { AGENT_IDS, type AgentId, FEEDBACK_AGENT_ID } from "./agent-constants";
import {
  isErrorJsonText,
  sanitizeAssistantText,
  shouldHideAssistantText,
} from "@repo/ai-ui/lib/message-sanitizer";

const allowedAgentIds = new Set<string>(Object.values(AGENT_IDS));

export class MastraGatewayError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "MastraGatewayError";
  }
}

export const mastraClient = new MastraClient({
  baseUrl: process.env.MASTRA_API_URL ?? "http://localhost:4111",
  retries: 2,
  backoffMs: 300,
  maxBackoffMs: 2_000,
  headers: {
    "X-Aria-Client": "apps-web",
  },
});

export function assertAgentId(agentId: string): AgentId {
  if (allowedAgentIds.has(agentId)) {
    return agentId as AgentId;
  }

  throw new MastraGatewayError(`Unknown agent: ${agentId}`, 404);
}

export type ProviderCatalogResponse = {
  providers: Array<{
    provider: string;
    connected: boolean;
    models: Array<{
      id: string;
      role: "agent" | "memory" | "both";
    }>;
  }>;
  activeProvider: string;
};

export type StreamAgentOptions = {
  agentId: string;
  messages: NormalizedChatMessage[];
  memory?: {
    thread?: string;
    resource?: string;
  };
  requestContext?: Record<string, string>;
  /** Tool-object keys the LLM may call this turn. `undefined` = all tools. */
  activeTools?: string[];
  /** Controls whether the model may use tools at all. */
  toolChoice?: "none" | "auto" | "required";
  /** Extra system context (preferences, behavior) prepended to the agent's system message. */
  systemContext?: string;
  /** Called once when the stream completes, with the full assistant text. */
  onFinish?: (result: { assistantText: string }) => Promise<void> | void;
};

type AgentStreamResponse = Response & {
  processDataStream: (options: {
    onChunk: (chunk: unknown) => Promise<void> | void;
  }) => Promise<void>;
};

type AgentStreamOptions = NonNullable<
  Parameters<ReturnType<MastraClient["getAgent"]>["stream"]>[1]
>;

function buildAgentStreamOptions({
  memory,
  requestContext,
  activeTools,
  toolChoice,
  systemContext,
}: Pick<
  StreamAgentOptions,
  "memory" | "requestContext" | "activeTools" | "toolChoice" | "systemContext"
>): AgentStreamOptions {
  const options: AgentStreamOptions = {
    maxSteps: 20,
  };

  if (memory?.thread) {
    options.memory = {
      thread: memory.thread,
      ...(memory.resource ? { resource: memory.resource } : {}),
    };
  }

  if (requestContext && Object.keys(requestContext).length > 0) {
    options.requestContext =
      requestContext as unknown as AgentStreamOptions["requestContext"];
  }

  if (activeTools !== undefined) {
    (options as Record<string, unknown>).activeTools = activeTools;
  }

  if (toolChoice !== undefined) {
    (options as Record<string, unknown>).toolChoice = toolChoice;
  }

  if (systemContext) {
    (options as Record<string, unknown>).system = systemContext;
  }

  return options;
}

function extractTextFromMastraChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";
  const c = chunk as Record<string, unknown>;

  if (typeof c.text === "string") return c.text;
  if (typeof c.delta === "string") return c.delta;

  const payload = c.payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p.text === "string") return p.text;
    if (typeof p.delta === "string") return p.delta;
  }

  return "";
}

function createMastraChunkStream(
  response: AgentStreamResponse,
  onFinish?: (text: string) => Promise<void> | void,
): ReadableStream<unknown> {
  let assistantText = "";
  return new ReadableStream<unknown>({
    async start(controller) {
      try {
        await response.processDataStream({
          onChunk: async (chunk) => {
            assistantText += extractTextFromMastraChunk(chunk);
            controller.enqueue(chunk);
          },
        });
        // ponytail: sanitize before persist — leaked tool JSON / preambles never enter history
        const sanitized = sanitizeAssistantText(assistantText);
        try {
          await onFinish?.(sanitized);
        } catch {
          // non-critical — don't break the stream if persistence fails
        }
        controller.close();
      } catch (error: unknown) {
        controller.error(error);
      }
    },
  });
}

export async function streamAgentToAiSdk({
  agentId,
  memory,
  messages,
  requestContext,
  activeTools,
  toolChoice,
  systemContext,
  onFinish,
}: StreamAgentOptions) {
  const resolvedAgentId = assertAgentId(agentId);
  const agent = mastraClient.getAgent(resolvedAgentId);

  const response = (await agent.stream(
    messages as Parameters<ReturnType<MastraClient["getAgent"]>["stream"]>[0],
    buildAgentStreamOptions({
      memory,
      requestContext,
      activeTools,
      toolChoice,
      systemContext,
    }),
  )) as AgentStreamResponse;

  const chunkStream = createMastraChunkStream(
    response,
    onFinish ? (text) => onFinish({ assistantText: text }) : undefined,
  );
  const aiSdkStream = toAISdkStream(
    chunkStream as unknown as Parameters<typeof toAISdkStream>[0],
    {
      from: "agent",
      version: "v6",
    },
  );

  // ponytail: per-stream accumulator — scoped to this request via closure, not
  // module-level, so concurrent requests don't leak hidden-text state. Declared
  // outside the Transformer literal because the Transformer type doesn't allow
  // custom properties. `accumulatedText` mirrors the per-id text so we can hide
  // long error blobs that arrive in many small deltas (no single delta matches
  // a hide rule, but the accumulated text does).
  const hiddenTextIds = new Map<string, boolean>();
  const accumulatedText = new Map<string, string>();

  return aiSdkStream.pipeThrough(
    new TransformStream({
      async transform(part, controller) {
        const guardrail = await runOutputGuardrails(part);
        if (!guardrail.allowed) {
          throw new MastraGatewayError(guardrail.reason, guardrail.status);
        }

        // ponytail: drop text-delta stream parts whose payload (or accumulated
        // text for the same part id) looks like leaked tool JSON / preambles /
        // upstream error blobs. Llama-style models print tool calls as text; AI
        // SDK stringifies provider errors into the stream on retry exhaustion.
        if (isHiddenTextDeltaPart(part, hiddenTextIds, accumulatedText)) {
          return;
        }

        controller.enqueue(part);
      },
    }),
  );
}

// ponytail: pull `message` (and optionally `name`) out of a stringified
// upstream error blob so we can show the user "Gone" / "rate limited" etc.
// instead of the raw JSON. Falls back to "" if not parseable.
function extractErrorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const message = typeof parsed.message === "string" ? parsed.message : "";
    const name = typeof parsed.name === "string" ? parsed.name : "";
    if (message && name) return `${name.replace(/Error$/, "").trim() || name}: ${message}`.trim();
    return message || name || "";
  } catch {
    return "";
  }
}

// ponytail: per-id accumulator for text-delta stream parts. When the
// accumulated text for a part matches a hide rule, drop subsequent deltas.
// Hidden state is reset on the next text-start for the same id.
function isHiddenTextDeltaPart(
  part: unknown,
  hiddenTextIds: Map<string, boolean>,
  accumulatedText: Map<string, string>,
): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as Record<string, unknown>;
  const type = p.type;

  if (type === "text-start") {
    const id = typeof p.id === "string" ? p.id : "";
    if (id) {
      hiddenTextIds.set(id, false);
      accumulatedText.set(id, "");
    }
    return false;
  }

  if (type === "text-end") {
    const id = typeof p.id === "string" ? p.id : "";
    if (id) {
      // ponytail: just free the per-id state. We don't re-check the accumulated
      // text here because any deltas that already passed through are on the
      // client; the render-time sanitizer (AssistantMessageParts) is
      // authoritative and hides the part based on its full text.
      hiddenTextIds.delete(id);
      accumulatedText.delete(id);
    }
    return false;
  }

  if (type !== "text-delta") return false;

  const id = typeof p.id === "string" ? p.id : "";
  const delta = typeof p.delta === "string" ? p.delta : "";

  if (id && hiddenTextIds.get(id)) {
    return true;
  }

  // Accumulate so we can detect error JSON that arrives in many deltas.
  if (id && delta) {
    const prev = accumulatedText.get(id) ?? "";
    accumulatedText.set(id, prev + delta);
    const acc = accumulatedText.get(id) ?? "";
    // ponytail: if the accumulated text is an upstream provider error blob
    // (NVIDIA/OpenAI-compatible 410/5xx stringified into the stream), surface
    // it as a MastraGatewayError so the client shows a real error bubble
    // instead of silently hiding it and leaving "Thinking..." forever.
    if (acc.length >= 32 && isErrorJsonText(acc)) {
      const detail = extractErrorMessage(acc);
      throw new MastraGatewayError(
        detail
          ? `ARIA's model provider returned an error: ${detail}`
          : "ARIA's model provider returned an error. Try again or switch model.",
        502,
      );
    }
    // Other hide-rule matches (tool JSON, preambles) — drop silently.
    if (acc.length >= 32 && shouldHideAssistantText(acc)) {
      hiddenTextIds.set(id, true);
      return true;
    }
  }

  if (shouldHideAssistantText(delta)) {
    if (id) hiddenTextIds.set(id, true);
    return true;
  }

  return false;
}

export async function executeAgentTool<TOutput>({
  agentId,
  data,
  requestContext,
  toolId,
}: {
  agentId: string;
  toolId: string;
  data: Record<string, unknown>;
  requestContext?: Record<string, string>;
}): Promise<TOutput> {
  const resolvedAgentId = assertAgentId(agentId);
  const agent = mastraClient.getAgent(resolvedAgentId);

  return agent.executeTool(toolId, {
    data,
    ...(requestContext
      ? { requestContext: requestContext as Record<string, unknown> }
      : {}),
  }) as Promise<TOutput>;
}

export async function fetchProviderCatalog(): Promise<ProviderCatalogResponse> {
  return executeAgentTool<ProviderCatalogResponse>({
    agentId: FEEDBACK_AGENT_ID,
    toolId: "get-available-providers",
    data: {},
  });
}
