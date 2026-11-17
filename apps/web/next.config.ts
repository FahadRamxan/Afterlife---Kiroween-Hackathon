import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Keeps the dev badge out of Playwright screenshots.
  devIndicators: false,
  transpilePackages: ['@afterlife/ui'],
};

export default config;
