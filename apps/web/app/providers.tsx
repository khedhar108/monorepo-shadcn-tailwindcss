"use client";

import { TooltipProvider } from "@repo/ui/components/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}
