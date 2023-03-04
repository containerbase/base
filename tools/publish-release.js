import shell from 'shelljs';
import { opts } from './utils.js';

const version = opts.release;
const dry = opts.dryRun;
/** @type {shell.ShellString} */
let r;

shell.echo(`Publish version: ${version}`);
process.env.TAG = version;

if (dry) {
  shell.echo('DRY-RUN: done.');
  shell.exit(0);
}

shell.echo('Pushing docker images');

r = shell.exec('docker buildx bake --progress plain --provenance=false push');
if (r.code) {
  shell.exit(1);
}

r = shell.exec(
  `cosign sign --yes ${process.env.OWNER}/${process.env.FILE}:${process.env.TAG}`
);
if (r.code) {
  shell.exit(1);
}

r = shell.exec(
  `cosign sign --yes ghcr.io/${process.env.OWNER}/${process.env.FILE}:${process.env.TAG}`
);
if (r.code) {
  shell.exit(1);
}
