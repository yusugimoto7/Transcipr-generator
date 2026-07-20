/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for Docker deploys (Railway, Render, Fly, a VPS).
  output: 'standalone',
  // Uploaded documents can be a few MB; allow generous server action / body limits.
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
};

module.exports = nextConfig;
