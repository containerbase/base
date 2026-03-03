import { createRequire } from 'node:module';
import { Command, Option, runExit } from 'clipanion';
import { execa } from 'execa';

const require = createRequire(import.meta.url);

class BatsCommand extends Command {
  args = Option.Proxy();

  async execute() {
    const bats = require.resolve('bats/bin/bats');
    const batsAssert = require.resolve('bats-assert/load.bash');
    const batsSupport = require.resolve('bats-support/load.bash');

    await execa(bats, this.args, {
      env: {
        BATS_ASSERT_LOAD_PATH: batsAssert,
        BATS_SUPPORT_LOAD_PATH: batsSupport,
      },
      stdio: 'inherit',
    });
  }
}

void runExit(BatsCommand);
