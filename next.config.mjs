/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces .next/standalone — a self-contained server bundle with only
  // the node_modules it actually needs, meant for Docker deployment.
  output: 'standalone',
};

export default nextConfig;
