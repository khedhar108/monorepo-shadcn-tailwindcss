"use client";

import { Badge } from "@repo/ui/components/badge";
import { Check } from "lucide-react";
import type { ProviderGroup } from "../../lib/types";
import {
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorSeparator,
} from "../ai-elements/model-selector";
import { useLlmSelection } from "./llm-selection-context";

export type ModelPickerDialogProps = {
  providers: ProviderGroup[];
  onOpenChange: (open: boolean) => void;
};

function sortProviders(providers: ProviderGroup[]): ProviderGroup[] {
  return [...providers].sort((a, b) => {
    if (a.connected !== b.connected) {
      return a.connected ? -1 : 1;
    }

    return a.displayName.localeCompare(b.displayName);
  });
}

export function ModelPickerDialog({
  providers,
  onOpenChange,
}: ModelPickerDialogProps) {
  const { selection, setSelection } = useLlmSelection();
  const sortedProviders = sortProviders(providers);

  function handleSelect(
    provider: ProviderGroup,
    model: ProviderGroup["models"][number],
  ) {
    setSelection({
      provider: provider.provider,
      model: model.id,
      displayName: model.name,
    });
    onOpenChange(false);
  }

  if (sortedProviders.length === 0) {
    return (
      <ModelSelectorContent title="Choose model">
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No providers available. Start the Mastra agent with{" "}
          <code>pnpm dev:agent</code> and configure API keys in{" "}
          <code>apps/agent/.env.local</code>.
        </p>
      </ModelSelectorContent>
    );
  }

  return (
    <ModelSelectorContent title="Choose model">
      <ModelSelectorInput placeholder="Search providers and models..." />
      <ModelSelectorList>
        <ModelSelectorEmpty>No models match your search.</ModelSelectorEmpty>

        {sortedProviders.map((provider, index) => (
          <div key={provider.provider}>
            {index > 0 ? <ModelSelectorSeparator /> : null}
            <ModelSelectorGroup heading={provider.displayName}>
              <div className="flex items-center gap-2 px-2 pb-1">
                {provider.connected ? (
                  <Badge variant="secondary">Connected</Badge>
                ) : (
                  <Badge variant="outline">No API key</Badge>
                )}
              </div>
              {provider.models.map((model) => {
                const isSelected =
                  selection?.provider === provider.provider &&
                  selection?.model === model.id;

                return (
                  <ModelSelectorItem
                    key={model.id}
                    value={`${provider.provider}-${model.id}`}
                    onSelect={() => handleSelect(provider, model)}
                  >
                    <ModelSelectorLogo provider={provider.provider} />
                    <ModelSelectorName>
                      {model.name}
                      <span className="block text-xs text-muted-foreground">
                        {model.id} · {model.role}
                      </span>
                    </ModelSelectorName>
                    {isSelected ? <Check className="ml-auto size-4" /> : null}
                  </ModelSelectorItem>
                );
              })}
            </ModelSelectorGroup>
          </div>
        ))}
      </ModelSelectorList>
    </ModelSelectorContent>
  );
}
