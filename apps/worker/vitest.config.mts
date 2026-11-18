import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.mts';

// The integration tests run real js-dos in headless Chromium. Files run one at a time, so their
// emulators do not starve each other of CPU (a starved DOS app drops typed-ahead keys).
export default mergeConfig(shared, defineProject({ test: { fileParallelism: false } }));
