/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined,
  transpilePackages: ['@lanyard/contracts'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
