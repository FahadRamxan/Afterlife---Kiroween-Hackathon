// @afterlife/emulator/headless: Node only (Playwright Chromium). The browser uses the package root.
export {
  HeadlessJsDos,
  HeadlessPool,
  openJsDosPage,
  pageEmulators,
  type HeadlessPoolOptions,
} from './headless-jsdos';
export { Pool, PoolClosedError, parsePoolEnv, type PoolOptions } from './pool';
