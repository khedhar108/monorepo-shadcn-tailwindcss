import { FEEDBACK_AGENT_ID } from "../../../lib/mastra-client";

export const maxDuration = 60;

type ChatRequestBody = {
  agentId?: string;
  messages?: unknown[];
  memory?: {
    thread?: string;
    resource?: string;
  };
  requestContext?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequestBody;
  const agentId = body.agentId ?? FEEDBACK_AGENT_ID;
  const mastraUrl = process.env.MASTRA_API_URL ?? "http://localhost:4111";

  const upstream = await fetch(`${mastraUrl}/chat/${agentId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: body.messages ?? [],
      memory: body.memory,
      requestContext: body.requestContext,
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return Response.json(
      {
        error: errorText || `Mastra chat request failed with ${upstream.status}`,
      },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
