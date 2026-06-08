/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lanyard/contracts'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
