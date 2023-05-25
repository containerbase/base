import fs from 'fs/promises';
import shell from 'shelljs';
import { opts } from './utils.js';

const version = opts.release;

shell.echo(`Preparing version: ${version}`);
process.env.TAG = version;
process.env.CONTAINERBASE_VERSION = version;

shell.mkdir('-p', 'bin');

await fs.writeFile('src/usr/local/buildpack/version', version);

let r = shell.exec('tar -cJf ./bin/containerbase.tar.xz -C ./src .');
if (r.code) {
  shell.exit(1);
}

r = shell.exec('sha512sum ./bin/containerbase.tar.xz');
if (r.code) {
  shell.exit(1);
}
r.to('./bin/containerbase.tar.xz.sha512');

r = shell.cp('./bin/containerbase.tar.xz', './bin/buildpack.tar.xz');
if (r.code) {
  shell.exit(1);
}

// compile the cli
r = shell.exec('yarn build:cli');
if (r.code) {
  shell.exit(1);
}

r = shell.exec(
  'docker buildx bake --set settings.platform=linux/amd64,linux/arm64 build'
);
if (r.code) {
  shell.exit(1);
}
