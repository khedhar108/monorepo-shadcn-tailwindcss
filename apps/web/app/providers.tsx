"use client";

import { TooltipProvider } from "@repo/ui/components/tooltip";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}
