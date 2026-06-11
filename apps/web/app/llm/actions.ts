"use server";

import {
  formatModelName,
  PROVIDER_DISPLAY_NAMES,
  type ProviderGroup,
} from "@repo/ai-ui/lib/types";
import { fetchProviderCatalog, type ProviderCatalogResponse } from "../../lib/mastra-client";

export type AvailableProvidersResult = {
  providers: ProviderGroup[];
  activeProvider: string | null;
};

function transformToProviderGroups(data: ProviderCatalogResponse): ProviderGroup[] {
  if (!data.providers?.length) {
    return [];
  }

  return data.providers.map((entry) => ({
    provider: entry.provider,
    displayName: PROVIDER_DISPLAY_NAMES[entry.provider] ?? entry.provider,
    connected: entry.connected,
    models: entry.models.map((model) => ({
      id: model.id,
      name: formatModelName(model.id),
      role: model.role,
    })),
  }));
}

export async function getAvailableProviders(): Promise<AvailableProvidersResult> {
  try {
    const data = await fetchProviderCatalog();

    return {
      providers: transformToProviderGroups(data),
      activeProvider: data.activeProvider ?? null,
    };
  } catch {
    return { providers: [], activeProvider: null };
  }
}
