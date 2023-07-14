import { Command, Option, runExit } from 'clipanion';
import { execa } from 'execa';

class BatsCommand extends Command {
  args = Option.Proxy({ required: false });

  async execute() {
    const bats = (await import.meta.resolve('bats/bin/bats')).replace(
      'file://',
      ''
    );
    const batsAssert = (
      await import.meta.resolve('bats-assert/load.bash')
    ).replace('file://', '');
    const batsSupport = (
      await import.meta.resolve('bats-support/load.bash')
    ).replace('file://', '');

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
