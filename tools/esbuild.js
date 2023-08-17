import fs from 'node:fs/promises';
import { build } from 'esbuild';
import esbuildPluginPino from 'esbuild-plugin-pino';
import { exec } from 'pkg';

await build({
  entryPoints: { 'containerbase-cli': './src/cli/index.ts' },
  bundle: true,
  platform: 'node',
  target: 'node18',
  minify: false,
  tsconfig: 'tsconfig.dist.json',
  // format: "esm", // not supported https://github.com/vercel/pkg/issues/1291
  outdir: './dist/',
  define: {
    'globalThis.CONTAINERBASE_VERSION': `"${
      process.env.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER'
    }"`,
  },
  plugins: [esbuildPluginPino({ transports: ['pino-pretty'] })],
});

await fs.writeFile(
  './dist/package.json',
  JSON.stringify(
    {
      name: 'containerbase-cli',
      version: process.env.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER',
      private: true,
      type: 'commonjs',
      bin: {
        'containerbase-cli': './containerbase-cli.js',
      },
      pkg: {
        scripts: ['pino-*.js', 'thread-stream-worker.js'],
        targets: ['node18-linux-x64', 'node18-linux-arm64'],
        patches: {
          './containerbase-cli.js': [
            'pinoBundlerAbsolutePath("./pino-file.js")',
            '"/snapshot/dist/pino-file.js"',
            'pinoBundlerAbsolutePath("./pino-pipeline-worker.js")',
            '"/snapshot/dist/pino-pipeline-worker.js"',
            'pinoBundlerAbsolutePath("./pino-pretty.js")',
            '"/snapshot/dist/pino-pretty.js"',
            'pinoBundlerAbsolutePath("./pino-worker.js")',
            '"/snapshot/dist/pino-worker.js"',
            'pinoBundlerAbsolutePath("./thread-stream-worker.js")',
            '"/snapshot/dist/thread-stream-worker.js"',
          ],
        },
      },
    },
    undefined,
    2,
  ),
);

await exec([
  '--out-path',
  './src/usr/local/containerbase/bin',
  '--public',
  '--options',
  'use-openssl-ca',
  // '--debug',
  'dist',
]);
