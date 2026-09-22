import { env } from 'node:process';
import {
  coverageConfigDefaults,
  defaultExclude,
  defineConfig,
} from 'vitest/config';

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
      include: ['src/cli/**/*.ts'],
      // negated patterns in `include` have no effect, the mocks and the test
      // helpers have to be dropped here
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/__mocks__/**',
        '**/*.d.ts',
        '**/types.ts',
        'test/**',
      ],
      // only on ci, so a local run against a single file does not fail
      ...(ci && { thresholds: { 100: true } }),
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
