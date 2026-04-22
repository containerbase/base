import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { exec } from '@yao-pkg/pkg';
import { rolldown } from 'rolldown';
import shell from 'shelljs';

const __require = createRequire(import.meta.url);

shell.config.fatal = true;

const nodeVersion = 24;
const version = process.env.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER';

shell.rm('-rf', 'dist/docker');
shell.mkdir('-p', 'dist/docker');
shell.cp('-r', 'src/usr', 'dist/docker/');

await fs.writeFile('dist/docker/usr/local/containerbase/version', version);

shell.echo('Bundling containerbase-cli ...');
const bundle = await rolldown({
  input: {
    'containerbase-cli': './src/cli/bundle.ts',
    // bundle pino dependencies
    'pino-file': __require.resolve('pino/file.js'),
    'pino-pretty': __require.resolve('pino-pretty'),
    'pino-worker': __require.resolve('pino/lib/worker.js'),
    'thread-stream-worker': __require.resolve('thread-stream/lib/worker.js'),
  },
  platform: 'node',
  tsconfig: true,

  transform: {
    define: {
      'globalThis.CONTAINERBASE_VERSION': `"${version}"`,
      'globalThis.rootDir': 'null',
    },
  },

  treeshake: {
    moduleSideEffects: [
      {
        test: /.*/,
        external: true,
        sideEffects: false,
      },
      {
        test: /^reflect-metadata$/,
        sideEffects: true,
      },
      {
        test: /\.ts$/,
        sideEffects: true,
      },
    ],
  },
});

shell.echo('Writing containerbase-cli bundle ...');
await bundle.write({ dir: 'dist/app', format: 'esm', cleanDir: true });

await fs.writeFile(
  './dist/package.json',
  JSON.stringify(
    {
      name: 'containerbase-cli',
      version,
      private: true,
      type: 'module',
      bin: {
        'containerbase-cli': './app/containerbase-cli.js',
      },
      pkg: {
        scripts: ['./app/*.js'],
        seaConfig: {
          useCodeCache: true,
        },
        targets: [
          `node${nodeVersion}-linux-x64`,
          `node${nodeVersion}-linux-arm64`,
        ],
      },
    },
    undefined,
    2,
  ),
);

await exec([
  '--sea',
  '--compress',
  'zstd',
  '--options',
  'use-openssl-ca',
  '--out-path',
  './dist/cli',
  // '--debug',
  'dist',
]);

if (!(await fs.stat('./dist/cli/containerbase-cli-amd64').catch(() => null))) {
  await fs.symlink(
    './containerbase-cli-x64',
    './dist/cli/containerbase-cli-amd64',
  );
}
