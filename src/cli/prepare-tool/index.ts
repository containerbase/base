import { Container } from 'inversify';
import { rootContainer } from '../services';
import { PrepareDockerService } from '../tools/docker';
import { logger } from '../utils';
import { PrepareLegacyToolsService } from './prepare-legacy-tools.service';
import { PREPARE_TOOL_TOKEN, PrepareToolService } from './prepare-tool.service';

function prepareContainer(): Container {
  logger.trace('preparing container');
  const container = new Container();
  container.parent = rootContainer;

  // core services
  container.bind(PrepareToolService).toSelf();
  container.bind(PrepareLegacyToolsService).toSelf();

  // tool services
  container.bind(PREPARE_TOOL_TOKEN).to(PrepareDockerService);

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
