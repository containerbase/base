import { env } from 'node:process';
import { defaultExclude, defineConfig } from 'vitest/config';

const ci = !!env.CI;

export default defineConfig({
  test: {
    // local Claude Code worktrees hold a full checkout of this repo
    exclude: [...defaultExclude, '**/.claude/worktrees/**'],
    coverage: {
      provider: 'v8',
      reporter: ci
        ? ['lcovonly', 'text']
        : ['@containerbase/istanbul-reports-html', 'text'],
      include: ['src/cli/**/*.ts', '!**/__mocks__/**', '!**/types.ts'],
    },
    reporters: ci
      ? ['default', 'github-actions', 'junit']
      : ['default', 'html'],
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
    setupFiles: './test/global-setup.ts',
    deps: { moduleDirectories: ['node_modules', '.yarn/'] },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
