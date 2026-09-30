/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces .next/standalone — a self-contained server bundle with only
  // the node_modules it actually needs, meant for Docker deployment.
  output: 'standalone',
  experimental: {
    // ssh2 (used by the attendance SFTP import) ships optional native
    // bindings that webpack can't bundle — load it from node_modules.
    serverComponentsExternalPackages: ['ssh2', 'ssh2-sftp-client'],
  },
};

export default nextConfig;
