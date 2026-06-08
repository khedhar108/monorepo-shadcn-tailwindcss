import Image from "next/image";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { BookOpen, ExternalLink, FileText } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-b from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900 flex flex-col items-center justify-center py-16 px-4 sm:px-6 lg:px-8">
      <header className="text-center max-w-2xl mb-12 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-xs text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-6 shadow-xs">
          <FileText className="size-3.5 text-primary" />
          <span>Aria Docs</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
          Monorepo Documentation
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground font-medium">
          Shared ShadCN UI components and global theme from{" "}
          <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded-md">@repo/ui</code>
        </p>
      </header>

      <main className="w-full max-w-2xl">
        <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-card shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="text-xl font-bold">Getting Started</CardTitle>
            <CardDescription>
              Edit <code className="font-mono text-xs">apps/docs/app/page.tsx</code> to customize
              this app. All ShadCN components come from the shared UI package.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6 space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground font-mono">
              <li>Run <code className="bg-muted px-1 rounded">pnpm install</code> from the repo root</li>
              <li>Start docs with <code className="bg-muted px-1 rounded">pnpm dev:docs</code></li>
              <li>Add components with <code className="bg-muted px-1 rounded">pnpm ui:add &lt;name&gt;</code></li>
            </ol>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row items-center gap-3 border-t border-border pt-6">
            <Button variant="default" className="w-full sm:w-auto gap-2" asChild>
              <a
                href="https://turborepo.dev/docs"
                target="_blank"
                rel="noopener noreferrer"
              >
                <BookOpen className="size-4" />
                Turborepo Docs
              </a>
            </Button>
            <Button variant="outline" className="w-full sm:w-auto gap-2" asChild>
              <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Open Web App
              </a>
            </Button>
          </CardFooter>
        </Card>
      </main>

      <footer className="mt-16 flex items-center gap-2 text-xs text-muted-foreground">
        <Image src="/globe.svg" alt="" width={16} height={16} aria-hidden />
        <span>Powered by @repo/ui global theme</span>
      </footer>
    </div>
  );
}
