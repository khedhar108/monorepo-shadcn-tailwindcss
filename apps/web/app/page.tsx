"use client";

import { AgentChat } from "@repo/ai-ui/components/llm/agent-chat";
import {
  LlmSelectionProvider,
  useLlmSelection,
} from "@repo/ai-ui/components/llm/llm-selection-context";
import { ModelPickerTrigger } from "@repo/ai-ui/components/llm/model-picker-trigger";
import type { ProviderGroup } from "@repo/ai-ui/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import {
  Terminal,
  Layers,
  CheckCircle2,
  BookOpen,
  GitBranch,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getAvailableProviders } from "./llm/actions";
import { FEEDBACK_AGENT_ID } from "../lib/agent-constants";

const examplePrompts = [
  "Summarize all customer feedback",
  "What are the critical issues from enterprise customers?",
  "Show me only the feature requests from pro users",
];

const packages = [
  { name: "web", type: "Next.js App", path: "apps/web", status: "Active" },
  { name: "agent", type: "Mastra Agent", path: "apps/agent", status: "Active" },
  {
    name: "@repo/ai-ui",
    type: "AI Chat UI",
    path: "packages/ai-ui",
    status: "Active",
  },
  {
    name: "@repo/ui",
    type: "Shared UI Library",
    path: "packages/ui",
    status: "Active",
  },
  { name: "docs", type: "Next.js App", path: "apps/docs", status: "Active" },
];

function HomeContent() {
  const [providers, setProviders] = useState<ProviderGroup[]>([]);
  const { setSelection } = useLlmSelection();

  useEffect(() => {
    void getAvailableProviders().then(
      ({ providers: nextProviders, activeProvider }) => {
        setProviders(nextProviders);

        if (nextProviders.length === 0) {
          return;
        }

        try {
          if (localStorage.getItem("aria-llm-selection")) {
            return;
          }
        } catch {
          // ignore storage errors
        }

        const active =
          nextProviders.find(
            (provider) => provider.provider === activeProvider,
          ) ??
          nextProviders.find((provider) => provider.connected) ??
          nextProviders[0];

        const defaultModel =
          active?.models.find((model) => model.role === "agent") ??
          active?.models[0];

        if (active && defaultModel) {
          setSelection({
            provider: active.provider,
            model: defaultModel.id,
            displayName: defaultModel.name,
          });
        }
      },
    );
  }, [setSelection]);

  return (
    <div className="min-h-screen bg-linear-to-b from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900 py-16 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="text-center max-w-2xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-xs text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-6 shadow-xs">
            <Layers className="size-3.5 text-primary" />
            <span>Aria · Mastra + Next.js</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-linear-to-r from-neutral-900 via-neutral-700 to-neutral-500 dark:from-neutral-100 dark:via-neutral-300 dark:to-neutral-500 bg-clip-text text-transparent mb-4">
            Welcome Pradeep
          </h1>
          <p className="text-base sm:text-lg text-neutral-500 dark:text-neutral-400 font-medium">
            Chat with the feedback summarizer agent. Responses stream from
            Mastra on port 4111.
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Choose a model for this session, then send a message below.
          </p>
          <ModelPickerTrigger
            providers={providers}
            className="w-full sm:w-auto sm:min-w-72"
          />
        </div>

        <AgentChat
          agentId={FEEDBACK_AGENT_ID}
          title="Customer Feedback Agent"
          description="Ask questions about customer feedback. Memory is scoped per browser session."
          placeholder="Ask the feedback summarizer..."
          examplePrompts={examplePrompts}
        />

        <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-neutral-100 dark:border-neutral-800 pb-6 bg-linear-to-r from-neutral-50/50 to-transparent dark:from-neutral-900/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 shadow-md">
                <GitBranch className="size-5" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Workspace Architecture
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Active local packages and apps in the Turborepo monorepo.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <div className="border border-neutral-200/60 dark:border-neutral-800/80 rounded-xl overflow-hidden bg-neutral-50/30 dark:bg-neutral-950/20">
              <Table>
                <TableHeader className="bg-neutral-50 dark:bg-neutral-900/50">
                  <TableRow>
                    <TableHead className="font-semibold text-neutral-600 dark:text-neutral-400">
                      Package Name
                    </TableHead>
                    <TableHead className="font-semibold text-neutral-600 dark:text-neutral-400">
                      Type
                    </TableHead>
                    <TableHead className="font-semibold text-neutral-600 dark:text-neutral-400">
                      Path
                    </TableHead>
                    <TableHead className="text-right font-semibold text-neutral-600 dark:text-neutral-400">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((pkg) => (
                    <TableRow
                      key={pkg.name}
                      className="hover:bg-neutral-50/80 dark:hover:bg-neutral-900/40 transition-colors"
                    >
                      <TableCell className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {pkg.name}
                      </TableCell>
                      <TableCell className="text-neutral-500 dark:text-neutral-400">
                        {pkg.type}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                        {pkg.path}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {pkg.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span>
                  Run <code>pnpm dev:web+agent</code> before chatting
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="flex items-center justify-center gap-2 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  onClick={() =>
                    window.open("https://turborepo.dev/docs", "_blank")
                  }
                >
                  <BookOpen className="size-4 text-neutral-500 dark:text-neutral-400" />
                  <span>Read Docs</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Alert className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 shadow-lg p-4 rounded-xl flex items-start gap-4">
          <Terminal className="size-5 text-neutral-500 dark:text-neutral-400 mt-0.5 shrink-0" />
          <div>
            <AlertTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Streaming chat route
            </AlertTitle>
            <AlertDescription className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              The browser calls <code>/api/chat</code>, which streams via the
              Mastra Client gateway to <code>{`{MASTRA_API_URL}`}</code> agent{" "}
              <code>{FEEDBACK_AGENT_ID}</code> with observational memory thread
              IDs and optional <code>requestContext</code> from the model
              picker. Provider keys stay in <code>apps/agent/.env.local</code>.
            </AlertDescription>
          </div>
        </Alert>

        <footer className="text-center text-xs text-neutral-400 dark:text-neutral-600 font-medium pb-8">
          <p>&copy; 2026 Aria Project. Designed with intentional minimalism.</p>
        </footer>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <LlmSelectionProvider>
      <HomeContent />
    </LlmSelectionProvider>
  );
}
