/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined,
  // @lanyard/contracts ships compiled JS, but transpiling is harmless and future-proof.
  transpilePackages: ['@lanyard/contracts'],
  eslint: {
    // CI runs typecheck + prettier; per-app ESLint is added later.
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
