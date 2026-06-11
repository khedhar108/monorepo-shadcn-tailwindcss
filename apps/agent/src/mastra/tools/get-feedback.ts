import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { feedbackItems } from "../data/feedback";

const sourceSchema = z.enum(["app_store", "intercom", "sales", "support", "twitter"]);
const customerTierSchema = z.enum(["free", "pro", "enterprise"]);

export const getFeedbackTool = createTool({
  id: "get-feedback",
  description:
    "Returns paginated customer feedback with optional source, customer tier, and date filters.",
  inputSchema: z.object({
    source: sourceSchema.optional(),
    customer_tier: customerTierSchema.optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).default(0),
  }),
  outputSchema: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        source: sourceSchema,
        customer_tier: customerTierSchema,
        category: z.enum(["bug", "feature_request", "praise", "complaint", "question"]),
        sentiment: z.enum(["negative", "neutral", "positive"]),
        urgency: z.enum(["low", "medium", "high", "critical"]),
        created_at: z.string(),
        title: z.string(),
        content: z.string(),
      }),
    ),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    has_more: z.boolean(),
  }),
  execute: async (input) => {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    const filtered = feedbackItems.filter((item) => {
      if (input.source && item.source !== input.source) {
        return false;
      }

      if (input.customer_tier && item.customer_tier !== input.customer_tier) {
        return false;
      }

      if (input.start_date && item.created_at < input.start_date) {
        return false;
      }

      if (input.end_date && item.created_at > input.end_date) {
        return false;
      }

      return true;
    });

    const items = filtered.slice(offset, offset + limit);

    return {
      items,
      total: filtered.length,
      limit,
      offset,
      has_more: offset + limit < filtered.length,
    };
  },
});
