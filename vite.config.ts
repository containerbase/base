import { env } from 'node:process';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const ci = !!env.CI;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    coverage: {
      reporter: ci ? ['lcovonly', 'text'] : ['html', 'text'],
    },
    restoreMocks: true,
    setupFiles: './test/global-setup.ts',
  },
});
