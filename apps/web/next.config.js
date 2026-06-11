/** @type {import('next').NextConfig} */
const nextConfig = {
  // transpilePackages tells Next.js to compile these shared packages on the fly
  // during dev/build, so they don't need a separate build step. Changes to .ts/.tsx
  // files in @repo/ui and @repo/ai-ui are picked up instantly via HMR.
  transpilePackages: ["@repo/ui", "@repo/ai-ui"],
};

export default nextConfig;
