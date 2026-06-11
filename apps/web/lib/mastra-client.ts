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
}: Pick<StreamAgentOptions, "memory" | "requestContext">): AgentStreamOptions {
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

  return options;
}

function createMastraChunkStream(
  response: AgentStreamResponse,
): ReadableStream<unknown> {
  return new ReadableStream<unknown>({
    start(controller) {
      response
        .processDataStream({
          onChunk: async (chunk) => {
            controller.enqueue(chunk);
          },
        })
        .then(
          () => controller.close(),
          (error: unknown) => controller.error(error),
        );
    },
  });
}

export async function streamAgentToAiSdk({
  agentId,
  memory,
  messages,
  requestContext,
}: StreamAgentOptions) {
  const resolvedAgentId = assertAgentId(agentId);
  const agent = mastraClient.getAgent(resolvedAgentId);

  const response = (await agent.stream(
    messages as Parameters<ReturnType<MastraClient["getAgent"]>["stream"]>[0],
    buildAgentStreamOptions({ memory, requestContext }),
  )) as AgentStreamResponse;

  const chunkStream = createMastraChunkStream(response);
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
