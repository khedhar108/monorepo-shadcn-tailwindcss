/** @type {import('next').NextConfig} */
const nextConfig = {
  // compiling Ui packages
  transpilePackages: ["@repo/ui", "@repo/ai-ui"],
};

export default nextConfig;
