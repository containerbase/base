import { build } from 'esbuild';
import { exec } from 'pkg';
// import { chmod } from "node:fs/promises";

await build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  minify: false,
  // format: "esm", // not supoorted
  outfile: './dist/containerbase-cli.js',
  define: {
    'process.env.CONTAINERBASE_VERSION': `"${
      process.env.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER'
    }"`,
  },
});

await exec([
  '--targets',
  'node18-linux-x64,node18-linux-arm64',
  '--out-path',
  './src/opt/containerbase/bin',
  '--public',
  './dist/containerbase-cli.js',
]);

// TODO: do we need to do this?
//await chmod("./src/opt/containerbase/bin/containerbase-cli-x64", 0o755);
//await chmod("./src/opt/containerbase/bin/containerbase-cli-arm64", 0o755);
