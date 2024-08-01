import { Container } from 'inversify';
import { rootContainer } from '../services';
import { DartPrepareService } from '../tools/dart';
import { DockerPrepareService } from '../tools/docker';
import { DotnetPrepareService } from '../tools/dotnet';
import { FlutterPrepareService } from '../tools/flutter';
import {
  JavaJdkPrepareService,
  JavaJrePrepareService,
  JavaPrepareService,
} from '../tools/java';
import { NodePrepareService } from '../tools/node';
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
  container.bind(PREPARE_TOOL_TOKEN).to(DartPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(DotnetPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(DockerPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(FlutterPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaJrePrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaJdkPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(NodePrepareService);

  logger.trace('preparing container done');
  return container;
}

export function prepareTools(
  tools: string[],
  dryRun = false,
): Promise<number | void> {
  const container = prepareContainer();
  return container.get(PrepareToolService).execute(tools, dryRun);
}
