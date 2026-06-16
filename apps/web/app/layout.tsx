import type { Metadata } from "next";
import localFont from "next/font/local";
import "@repo/ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "ARIA – Adaptive Reasoning & Intelligence Agent",
  description:
    "An adaptive AI console powered by Mastra, LibSQL knowledge graphs, and feedback-tuned memory. Talk, watch ARIA think, and shape its future responses.",
  keywords: [
    "ARIA",
    "adaptive AI",
    "knowledge graph",
    "Mastra",
    "semantic memory",
    "feedback loop",
  ],
  openGraph: {
    title: "ARIA – Adaptive Reasoning & Intelligence Agent",
    description:
      "Every answer strengthens the graph. Every miss weakens the pattern. The assistant learns what to repeat, avoid, and connect.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
