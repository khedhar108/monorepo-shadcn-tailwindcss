import {
  appendMessages,
  getThreadMessages,
  type StoredMessage,
} from "../../../../lib/chat-history-store";

export const runtime = "nodejs";

export type ChatHistoryResponse = {
  messages: StoredMessage[];
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return Response.json(
        { error: "Missing threadId parameter" },
        { status: 400 },
      );
    }

    const messages = await getThreadMessages(threadId);

    return Response.json({ messages });
  } catch {
    return Response.json(
      { error: "Failed to read chat history", messages: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      threadId: string;
      messages: StoredMessage[];
      userId?: string;
    };

    if (!body.threadId || !Array.isArray(body.messages)) {
      return Response.json(
        { error: "threadId and messages[] are required" },
        { status: 400 },
      );
    }

    await appendMessages(body.threadId, body.messages, body.userId);

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Failed to save messages" },
      { status: 500 },
    );
  }
}
