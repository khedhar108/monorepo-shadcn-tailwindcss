"use client";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import {
  Terminal,
  Layers,
  CheckCircle2,
  ExternalLink,
  BookOpen,
  ArrowRight,
  GitBranch,
} from "lucide-react";

export default function Home() {
  const packages = [
    { name: "web", type: "Next.js App", path: "apps/web", status: "Active" },
    { name: "docs", type: "Next.js App", path: "apps/docs", status: "Active" },
    { name: "@repo/ui", type: "Shared UI Library", path: "packages/ui", status: "Active" },
    { name: "@repo/eslint-config", type: "Lint Rules", path: "packages/eslint-config", status: "Active" },
    { name: "@repo/typescript-config", type: "TS Configs", path: "packages/typescript-config", status: "Active" },
  ];

  return (
    <div className="min-h-screen bg-linear-to-b from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900 flex flex-col items-center justify-center py-16 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      {/* Header section with badge */}
      <header className="text-center max-w-2xl mb-12 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-xs text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-6 shadow-xs animate-fade-in">
          <Layers className="size-3.5 text-primary" />
          <span>Turborepo Workspace v2.0</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-linear-to-r from-neutral-900 via-neutral-700 to-neutral-500 dark:from-neutral-100 dark:via-neutral-300 dark:to-neutral-500 bg-clip-text text-transparent mb-4">
          Welcome Pradeep
        </h1>
        <p className="text-base sm:text-lg text-neutral-500 dark:text-neutral-400 font-medium">
          A bespoke monorepo layout powered by Tailwind CSS v4 and fully custom ShadCN UI components.
        </p>
      </header>

      {/* Main card */}
      <main className="w-full max-w-3xl space-y-6">
        <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 shadow-xl rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-neutral-300/80 dark:hover:border-neutral-700/80">
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
                  Active local packages and apps imported across the Turborepo monorepo.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6">
            <div className="border border-neutral-200/60 dark:border-neutral-800/80 rounded-xl overflow-hidden bg-neutral-50/30 dark:bg-neutral-950/20">
              <Table>
                <TableHeader className="bg-neutral-50 dark:bg-neutral-900/50">
                  <TableRow>
                    <TableHead className="font-semibold text-neutral-600 dark:text-neutral-400">Package Name</TableHead>
                    <TableHead className="font-semibold text-neutral-600 dark:text-neutral-400">Type</TableHead>
                    <TableHead className="font-semibold text-neutral-600 dark:text-neutral-400">Path</TableHead>
                    <TableHead className="text-right font-semibold text-neutral-600 dark:text-neutral-400">Status</TableHead>
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
          </CardContent>
          
          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-neutral-100 dark:border-neutral-800 pt-6">
            <div className="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              <span>Tailwind CSS v4 &amp; ShadCN integration is active</span>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button 
                variant="outline"
                className="w-full sm:w-auto flex items-center justify-center gap-2 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                onClick={() => window.open("https://turborepo.dev/docs", "_blank")}
              >
                <BookOpen className="size-4 text-neutral-500 dark:text-neutral-400" />
                <span>Read Docs</span>
              </Button>
              <Button 
                variant="default"
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200 shadow-md font-semibold cursor-pointer"
                onClick={() => alert("Welcome to the Aria monorepo platform!")}
              >
                <span>Get Started</span>
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>

        {/* Integration verification alert */}
        <Alert className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 shadow-lg p-4 rounded-xl flex items-start gap-4">
          <Terminal className="size-5 text-neutral-500 dark:text-neutral-400 mt-0.5 shrink-0" />
          <div>
            <AlertTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Compilation Success
            </AlertTitle>
            <AlertDescription className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              Component styles come from pre-compiled <code>@repo/ui/styles.css</code>. App utilities
              and shared tokens use <code>@repo/ui/globals.css</code> via the two-compilation model.
            </AlertDescription>
          </div>
        </Alert>
      </main>
      
      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-neutral-400 dark:text-neutral-600 font-medium">
        <p>&copy; 2026 Aria Project. Designed with intentional minimalism.</p>
      </footer>
    </div>
  );
}
