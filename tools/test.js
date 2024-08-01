import { promises as fs } from 'fs';
import { Command, Option, runExit } from 'clipanion';
import { execa } from 'execa';
import shell from 'shelljs';

shell.config.fatal = true;

class TestCommand extends Command {
  tests = Option.Rest();
  dryRun = Option.Boolean('-d,--dry-run');
  target = Option.String('-t,--target');
  build = Option.Boolean('-b,--build');
  debug = Option.Boolean('-D,--debug');
  logLevel = Option.String('-l,--log-level');
  plain = Option.Boolean('-p,--plain');

  async execute() {
    let tests = this.tests;
    let explicit = true;
    const env = {};

    if (this.build) {
      shell.echo('Compiling sources');
      shell.exec('pnpm build');
    }

    if (!tests.length) {
      tests = shell.ls('test');
      explicit = false;
      shell.echo('Running all tests');
    }

    if (this.debug) {
      shell.echo('Debug mode enabled');
      env.CONTAINERBASE_DEBUG = '1';
      env.BUILDKIT_PROGRESS = '1';
    }

    if (this.logLevel) {
      shell.echo('Setting log level to', this.logLevel);
      env.CONTAINERBASE_LOG_LEVEL = this.logLevel;
      env.BUILDKIT_PROGRESS = 'plain';
    }

    if (this.plain) {
      shell.echo('Setting buildx plain progess');
      env.BUILDKIT_PROGRESS = 'plain';
    }

    for (const d of tests) {
      if (
        !(await fs.stat(`test/${d}/Dockerfile`).catch(() => null))?.isFile()
      ) {
        if (explicit) {
          shell.echo(`test '${d}' not found!`);
          return 1;
        }
        continue;
      }
      shell.echo('Processing:', d);
      await execa('docker', ['buildx', 'bake', this.target ?? 'default'], {
        env: { ...env, TAG: d },
        stdio: 'inherit',
      });
    }
    return 0;
  }
}

void runExit(TestCommand);
