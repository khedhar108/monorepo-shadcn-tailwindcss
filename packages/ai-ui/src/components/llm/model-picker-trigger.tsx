"use client";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import { ChevronDown, Cpu } from "lucide-react";
import { useState } from "react";
import type { ProviderGroup } from "../../lib/types";
import {
  ModelSelector,
  ModelSelectorTrigger,
} from "../ai-elements/model-selector";
import { useLlmSelection } from "./llm-selection-context";
import { ModelPickerDialog } from "./model-picker-dialog";

export type ModelPickerTriggerProps = {
  providers: ProviderGroup[];
  className?: string;
};

function getSelectionLabel(
  selection: ReturnType<typeof useLlmSelection>["selection"],
  providers: ProviderGroup[],
): string {
  if (!selection) {
    return "Select model";
  }

  const provider = providers.find((item) => item.provider === selection.provider);
  const providerLabel = provider?.displayName ?? selection.provider;
  const modelLabel =
    selection.displayName ??
    provider?.models.find((model) => model.id === selection.model)?.name ??
    selection.model.split("/").pop() ??
    selection.model;

  return `${providerLabel} · ${modelLabel}`;
}

export function ModelPickerTrigger({ providers, className }: ModelPickerTriggerProps) {
  const { selection } = useLlmSelection();
  const [open, setOpen] = useState(false);
  const label = getSelectionLabel(selection, providers);

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("justify-between gap-2", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Cpu />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </ModelSelectorTrigger>

      <ModelPickerDialog providers={providers} onOpenChange={setOpen} />
    </ModelSelector>
  );
}
