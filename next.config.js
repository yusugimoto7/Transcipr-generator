/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Runs instrumentation.js once at server start, which arms the built-in
  // scheduler when DRAWS_AUTORUN=true.
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
