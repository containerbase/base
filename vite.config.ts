import { env } from 'node:process';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const ci = !!env.CI;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ci ? ['lcovonly', 'text'] : ['html-spa', 'text'],
      include: ['src/cli/**/*.ts', '!**/__mocks__/**', '!**/types.ts'],
    },
    reporters: ci ? ['default', 'github-actions'] : ['default', 'html'],
    restoreMocks: true,
    setupFiles: './test/global-setup.ts',
    deps: { moduleDirectories: ['node_modules', '.yarn/'] },
  },
});
