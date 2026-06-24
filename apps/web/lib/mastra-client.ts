import { toAISdkStream } from "@mastra/ai-sdk";
import { MastraClient } from "@mastra/client-js";
import {
  runOutputGuardrails,
  type NormalizedChatMessage,
} from "./mastra-guardrails";
import { AGENT_IDS, type AgentId, FEEDBACK_AGENT_ID } from "./agent-constants";

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
            // ponytail: Mastra ChunkType puts text at payload.text for text-delta
            const c = chunk as {
              type?: string;
              text?: string;
              payload?: { text?: string };
            };
            if (typeof c.text === "string") assistantText += c.text;
            if (c.type === "text-delta" && typeof c.payload?.text === "string") {
              assistantText += c.payload.text;
            }
            controller.enqueue(chunk);
          },
        });
        try {
          await onFinish?.(assistantText);
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

  return aiSdkStream.pipeThrough(
    new TransformStream({
      async transform(part, controller) {
        const guardrail = await runOutputGuardrails(part);
        if (!guardrail.allowed) {
          throw new MastraGatewayError(guardrail.reason, guardrail.status);
        }

        controller.enqueue(part);
      },
    }),
  );
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
