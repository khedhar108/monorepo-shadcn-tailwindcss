import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getActiveProvider } from "../config/model-providers";
import { getConnectedProviders } from "../config/provider-catalog";

export const getAvailableProvidersTool = createTool({
  id: "get-available-providers",
  description:
    "Returns the list of LLM providers configured on this agent server and their connection status.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    providers: z.array(
      z.object({
        provider: z.string(),
        connected: z.boolean(),
        models: z.array(
          z.object({
            id: z.string(),
            role: z.enum(["agent", "memory", "both"]),
          }),
        ),
      }),
    ),
    activeProvider: z.string(),
  }),
  execute: async () => ({
    providers: getConnectedProviders(),
    activeProvider: getActiveProvider(),
  }),
});
