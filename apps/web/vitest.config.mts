import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.mts';
// The web app keeps pure logic in lib/ (pages and components are covered by Playwright). A few
// lib tests render a component to HTML (the receipt's snapshot, Prompt 61): Next keeps JSX as it
// is (tsconfig "preserve"), so the tests compile it themselves.
export default mergeConfig(
  shared,
  defineProject({
    oxc: { jsx: { runtime: 'automatic' } },
    test: { include: ['lib/**/*.test.ts'] },
  }),
);
