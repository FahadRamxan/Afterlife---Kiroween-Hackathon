import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
      // js-dos, copied from node_modules by apps/web/scripts/copy-jsdos.mjs (third-party, minified).
      'apps/web/public/js-dos/**',
      // Built by Serwist from apps/web/app/sw.ts.
      'apps/web/public/sw*.js',
      'apps/web/public/swe-worker*.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
