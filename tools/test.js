import { promises as fs } from 'fs';
import { Command, Option, runExit } from 'clipanion';
import shell from 'shelljs';

shell.config.fatal = true;

class TestCommand extends Command {
  tests = Option.Rest();
  dryRun = Option.Boolean('-d,--dry-run');
  target = Option.String('-t,--target');
  build = Option.Boolean('-b,--build');

  async execute() {
    let tests = this.tests;
    let explicit = true;

    if (this.build) {
      shell.echo('Compiling sources');
      shell.exec('yarn build');
    }

    if (!tests.length) {
      tests = shell.ls('test');
      explicit = false;
      shell.echo('Running all tests');
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
      shell.exec(`docker buildx bake ${this.target}`, {
        env: { ...process.env, TAG: d },
      });
    }
    return 0;
  }
}

void runExit(TestCommand);
