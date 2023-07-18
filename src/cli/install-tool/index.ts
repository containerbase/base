import { Container } from 'inversify';
import { rootContainer } from '../services';
import { InstallDartService } from '../tools/dart';
import { InstallDockerService } from '../tools/docker';
import { InstallFluxService } from '../tools/flux';
import { logger } from '../utils';
import { InstallLegacyToolService } from './install-legacy-tool.service';
import { INSTALL_TOOL_TOKEN, InstallToolService } from './install-tool.service';

function prepareContainer(): Container {
  logger.trace('preparing container');
  const container = new Container();
  container.parent = rootContainer;

  // core services
  container.bind(InstallToolService).toSelf();
  container.bind(InstallLegacyToolService).toSelf();

  // tool services
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDockerService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDartService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallFluxService);

  logger.trace('preparing container done');
  return container;
}

export function installTool(
  tool: string,
  version: string,
  dryRun = false
): Promise<number | void> {
  const container = prepareContainer();
  return container.get(InstallToolService).execute(tool, version, dryRun);
}
