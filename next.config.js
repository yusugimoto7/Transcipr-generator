/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Runs instrumentation.js once at server start — arms the built-in draw
  // scheduler when DRAWS_AUTORUN=true, so no external cron job is needed.
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
