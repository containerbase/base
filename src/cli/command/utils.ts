import { env } from 'node:process';
import is from '@sindresorhus/is';
import { Command, Option } from 'clipanion';
import * as t from 'typanion';
import { logger, validateVersion } from '../utils';

export function getVersion(tool: string): string | undefined {
  return env[tool.replace('-', '_').toUpperCase() + '_VERSION'];
}

export abstract class InstallToolBaseCommand extends Command {
  name = Option.String();

  dryRun = Option.Boolean('-d,--dry-run', false);

  version = Option.String({
    validator: t.cascade(t.isString(), validateVersion()),
    required: false,
  });

  override execute(): Promise<number | void> {
    let version = this.version;

    if (!is.nonEmptyStringAndNotWhitespace(version)) {
      version = getVersion(this.name);
    }

    if (!is.nonEmptyStringAndNotWhitespace(version)) {
      logger.debug(`No version found for ${this.name}`);
    }
    return this._execute(version);
  }
  protected abstract _execute(
    version: string | undefined,
  ): Promise<number | void>;
}
