"use server";

import {
  formatModelName,
  PROVIDER_DISPLAY_NAMES,
  type ProviderGroup,
} from "@repo/ai-ui/lib/types";

type ProviderToolResponse = {
  providers?: Array<{
    provider: string;
    connected: boolean;
    models: {
      agent: string;
      memory: string;
    };
  }>;
  activeProvider?: string;
};

export type AvailableProvidersResult = {
  providers: ProviderGroup[];
  activeProvider: string | null;
};

function transformToProviderGroups(data: ProviderToolResponse): ProviderGroup[] {
  if (!data.providers?.length) {
    return [];
  }

  return data.providers.map((entry) => {
    const models: ProviderGroup["models"] = [];

    if (entry.models.agent) {
      models.push({
        id: entry.models.agent,
        name: formatModelName(entry.models.agent),
        role: entry.models.agent === entry.models.memory ? "both" : "agent",
      });
    }

    if (entry.models.memory && entry.models.memory !== entry.models.agent) {
      models.push({
        id: entry.models.memory,
        name: formatModelName(entry.models.memory),
        role: "memory",
      });
    }

    return {
      provider: entry.provider,
      displayName: PROVIDER_DISPLAY_NAMES[entry.provider] ?? entry.provider,
      connected: entry.connected,
      models,
    };
  });
}

export async function getAvailableProviders(): Promise<AvailableProvidersResult> {
  const mastraUrl = process.env.MASTRA_API_URL ?? "http://localhost:4111";

  try {
    const res = await fetch(`${mastraUrl}/api/tools/get-available-providers/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
      cache: "no-store",
    });

    if (!res.ok) {
      return { providers: [], activeProvider: null };
    }

    const data = (await res.json()) as ProviderToolResponse;
    return {
      providers: transformToProviderGroups(data),
      activeProvider: data.activeProvider ?? null,
    };
  } catch {
    return { providers: [], activeProvider: null };
  }
}
