import { NextResponse } from "next/server";
import {
  appendHistoryEntry,
  getHistoryEntries,
  type HistoryEntry,
} from "../../../lib/chat-history-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limit = searchParams.get("limit");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 },
      );
    }

    const entries = await getHistoryEntries(
      userId,
      limit ? parseInt(limit, 10) : 50,
    );

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("History GET error:", error);
    return NextResponse.json(
      { error: "Failed to read history", entries: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HistoryEntry;

    if (!body.threadId || !body.userId) {
      return NextResponse.json(
        { error: "threadId and userId are required" },
        { status: 400 },
      );
    }

    const entry: HistoryEntry = {
      threadId: body.threadId,
      userId: body.userId,
      firstMessage: body.firstMessage ?? "",
      topics: Array.isArray(body.topics) ? body.topics : [],
      createdAt: body.createdAt ?? new Date().toISOString(),
      lastActive: body.lastActive ?? new Date().toISOString(),
      messageCount: typeof body.messageCount === "number" ? body.messageCount : 1,
      feedbackCount: typeof body.feedbackCount === "number" ? body.feedbackCount : 0,
      messages: Array.isArray((body as Record<string, unknown>).messages)
        ? (body as Record<string, unknown>).messages as HistoryEntry["messages"]
        : [],
      lastQuery: (body as Record<string, unknown>).lastQuery as string | undefined,
      lastResult: (body as Record<string, unknown>).lastResult as string | undefined,
    };

    await appendHistoryEntry(entry);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("History POST error:", error);
    return NextResponse.json(
      { error: "Failed to write history" },
      { status: 500 },
    );
  }
}
