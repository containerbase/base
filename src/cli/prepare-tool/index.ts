import { Container } from 'inversify';
import { logger } from '../utils';
import { PrepareLegacyToolsService } from './prepare-legacy-tools.service';
import { PrepareToolService } from './prepare-tool.service';

function prepareContainer(): Container {
  logger.trace('preparing container');
  const container = new Container();

  // core services
  container.bind(PrepareToolService).toSelf();
  container.bind(PrepareLegacyToolsService).toSelf();

  // tool services
  // TODO: add real services when tools are implemented

  logger.trace('preparing container done');
  return container;
}

export function execute(
  tools: string[],
  dryRun = false
): Promise<number | void> {
  const container = prepareContainer();
  return container.get(PrepareToolService).execute(tools, dryRun);
}
