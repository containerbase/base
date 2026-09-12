import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const version = process.argv[2];
assert.ok(version, 'Expected the installed Vite+ version');

const cwd = mkdtempSync(join(tmpdir(), 'containerbase-vp-'));
const manifest = {
  name: 'vp-install-test',
  private: true,
  scripts: { postinstall: 'exit 91' },
  devDependencies: {
    'vite-plus': '0.0.0',
    vite: 'npm:@voidzero-dev/vite-plus-core@0.0.0',
    vitest: '0.0.0',
    '@vitest/coverage-v8': '0.0.0',
    typescript: '5.8.0',
  },
};
const contents = JSON.stringify(manifest, null, 2) + '\n';
const config = 'throw new Error("Project configuration must not be loaded");\n';

function plan(manifestContents) {
  return JSON.parse(
    execFileSync(process.env.VP_TEST_BIN ?? 'vp', ['sync-versions', '--json'], {
      cwd,
      encoding: 'utf8',
      input: JSON.stringify({
        schemaVersion: 1,
        workspace: '.',
        manifests: [
          {
            path: 'package.json',
            kind: 'packageJson',
            contents: manifestContents,
          },
        ],
      }),
    }),
  );
}

try {
  writeFileSync(join(cwd, 'package.json'), contents);
  writeFileSync(join(cwd, 'vite.config.mjs'), config);

  const result = plan(contents);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.tool, { name: 'vite-plus', version });
  assert.equal(result.workspace, '.');
  assert.equal(result.replacements.length, 1);

  const replacement = result.replacements[0];
  assert.equal(replacement.path, 'package.json');
  assert.equal(replacement.kind, 'packageJson');
  assert.equal(replacement.before, contents);

  const updated = JSON.parse(replacement.after);
  const vitestVersion = updated.devDependencies.vitest;
  assert.match(vitestVersion, /^\d+\.\d+\.\d+/);
  assert.notEqual(vitestVersion, '0.0.0');
  assert.deepEqual(updated, {
    ...manifest,
    devDependencies: {
      ...manifest.devDependencies,
      'vite-plus': version,
      vite: `npm:@voidzero-dev/vite-plus-core@${version}`,
      vitest: vitestVersion,
      '@vitest/coverage-v8': vitestVersion,
    },
  });

  assert.deepEqual(plan(replacement.after), {
    schemaVersion: 1,
    tool: { name: 'vite-plus', version },
    workspace: '.',
    replacements: [],
  });
  assert.equal(readFileSync(join(cwd, 'package.json'), 'utf8'), contents);
  assert.equal(readFileSync(join(cwd, 'vite.config.mjs'), 'utf8'), config);
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
