import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  // Keeps the dev badge out of Playwright screenshots.
  devIndicators: false,
  transpilePackages: ['@afterlife/ui'],
};

export default withNextIntl(config);
