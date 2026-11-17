import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.mts';

// The web app keeps pure logic in lib/ (pages and components are covered by Playwright).
export default mergeConfig(shared, defineProject({ test: { include: ['lib/**/*.test.ts'] } }));
