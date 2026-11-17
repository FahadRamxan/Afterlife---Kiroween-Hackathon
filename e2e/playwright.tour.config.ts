// Screenshot tour (pnpm screenshots): the normal config, but only screenshots.tour.ts.
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'screenshots.tour.ts',
  grep: undefined,
  retries: 0,
});
