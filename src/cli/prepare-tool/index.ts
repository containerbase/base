import { Container, injectFromHierarchy, injectable } from 'inversify';
import { PathService, createContainer } from '../services';
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
import { PhpPrepareService } from '../tools/php';
import { ConanPrepareService } from '../tools/python/conan';
import { logger } from '../utils';
import { V2ToolPrepareService } from './prepare-legacy-tools.service';
import { PREPARE_TOOL_TOKEN, PrepareToolService } from './prepare-tool.service';

async function prepareContainer(): Promise<Container> {
  logger.trace('preparing container');
  const container = createContainer();

  // core services
  container.bind(PrepareToolService).toSelf();

  // v2 tool services
  const pathSvc = await container.getAsync(PathService);
  for (const tool of await pathSvc.findLegacyTools()) {
    @injectable()
    @injectFromHierarchy()
    class GenericV2ToolPrepareService extends V2ToolPrepareService {
      override readonly name: string = tool;
    }
    container.bind(PREPARE_TOOL_TOKEN).to(GenericV2ToolPrepareService);
  }

  // modern tool services
  container.bind(PREPARE_TOOL_TOKEN).to(ConanPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(DartPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(DotnetPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(DockerPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(FlutterPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaJrePrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaJdkPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(NodePrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(PhpPrepareService);

  logger.trace('preparing container done');
  return container;
}

export async function prepareTools(
  tools: string[],
  dryRun = false,
): Promise<number | void> {
  const container = await prepareContainer();
  const svc = await container.getAsync(PrepareToolService);
  return svc.prepare(tools, dryRun);
}

export async function initializeTools(
  tools: string[],
  dryRun = false,
): Promise<number | void> {
  const container = await prepareContainer();
  const svc = await container.getAsync(PrepareToolService);
  return svc.initialize(tools, dryRun);
}
