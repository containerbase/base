import { env } from 'node:process';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import GithubActionsReporter from 'vitest-github-actions-reporter';

const ci = !!env.CI;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    coverage: {
      reporter: ci ? ['lcovonly', 'text'] : ['html', 'text'],
      include: ['src/cli/**/*.ts'],
    },
    reporters: ci
      ? ['default', new GithubActionsReporter()]
      : ['default', 'html'],
    restoreMocks: true,
    setupFiles: './test/global-setup.ts',
    deps: { moduleDirectories: ['node_modules', '.yarn/'] },
  },
});
