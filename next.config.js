/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The hash-based CSP that used to live here (and the fixed
  // generateBuildId that stabilized it across rebuilds) is no longer
  // needed -- every page is now forced into per-request dynamic
  // rendering (see each page.tsx's Server/Client split), which means
  // there's no static caching left for a per-request nonce to conflict
  // with. middleware.ts now sets one universal nonce + strict-dynamic
  // CSP for the whole app instead. See middleware.ts for the full
  // reasoning.
};

module.exports = nextConfig;
