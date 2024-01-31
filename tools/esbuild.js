import fs from 'node:fs/promises';
import { exec } from '@yao-pkg/pkg';
import { build } from 'esbuild';
import esbuildPluginPino from 'esbuild-plugin-pino';
import shell from 'shelljs';

shell.config.fatal = true;

const nodeVersion = 20;
const version = process.env.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER';

shell.rm('-rf', 'dist/docker');
shell.mkdir('-p', 'dist/docker');
shell.cp('-r', 'src/usr', 'dist/docker/');

await fs.writeFile('dist/docker/usr/local/containerbase/version', version);

await build({
  entryPoints: { 'containerbase-cli': './src/cli/index.ts' },
  bundle: true,
  platform: 'node',
  target: `node${nodeVersion}`,
  minify: false,
  tsconfig: 'tsconfig.dist.json',
  // format: "esm", // not supported https://github.com/vercel/pkg/issues/1291
  outdir: './dist',
  define: {
    'globalThis.CONTAINERBASE_VERSION': `"${version}"`,
  },
  plugins: [esbuildPluginPino({ transports: ['pino-pretty'] })],
});

await fs.writeFile(
  './dist/package.json',
  JSON.stringify(
    {
      name: 'containerbase-cli',
      version,
      private: true,
      type: 'commonjs',
      bin: {
        'containerbase-cli': './containerbase-cli.js',
      },
      pkg: {
        outputPath: './dist/cli',
        scripts: ['pino-*.js', 'thread-stream-worker.js'],
        targets: [
          `node${nodeVersion}-linux-x64`,
          `node${nodeVersion}-linux-arm64`,
        ],
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
  '--no-bytecode',
  '--public',
  '--options',
  'use-openssl-ca',
  // '--debug',
  'dist',
]);

await fs.rename(
  './dist/cli/containerbase-cli-x64',
  './dist/cli/containerbase-cli-amd64',
);
