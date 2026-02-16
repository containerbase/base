import { Container, injectFromHierarchy, injectable } from 'inversify';
import { PathService, createContainer } from '../services';
import { DartPrepareService } from '../tools/dart';
import { DockerPrepareService } from '../tools/docker';
import { DotnetPrepareService } from '../tools/dotnet';
import { ErlangPrepareService } from '../tools/erlang';
import { ElixirPrepareService } from '../tools/erlang/elixir';
import { FlutterPrepareService } from '../tools/flutter';
import { GolangPrepareService } from '../tools/golang';
import {
  JavaJdkPrepareService,
  JavaJrePrepareService,
  JavaPrepareService,
} from '../tools/java';
import { SbtPrepareService } from '../tools/java/sbt';
import { MonoPrepareService } from '../tools/mono';
import { NodePrepareService } from '../tools/node';
import { PhpPrepareService } from '../tools/php';
import { PowershellPrepareService } from '../tools/powershell';
import { PythonPrepareService } from '../tools/python';
import { ConanPrepareService } from '../tools/python/conan';
import { RubyPrepareService } from '../tools/ruby';
import { RustPrepareService } from '../tools/rust';
import { SwiftPrepareService } from '../tools/swift';
import { logger } from '../utils';
import { isNotKnownV2Tool } from '../utils/v2-tool';
import { V2ToolPrepareService } from './prepare-legacy-tools.service';
import { PREPARE_TOOL_TOKEN, PrepareToolService } from './prepare-tool.service';

async function prepareContainer(): Promise<Container> {
  logger.trace('preparing container');
  const container = createContainer();

  // core services
  container.bind(PrepareToolService).toSelf();

  // v2 tool services
  const pathSvc = await container.getAsync(PathService);
  const v2Tools = await pathSvc.findLegacyTools();
  for (const tool of v2Tools.filter(isNotKnownV2Tool)) {
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
  container.bind(PREPARE_TOOL_TOKEN).to(ElixirPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(ErlangPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(FlutterPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(GolangPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaJrePrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaJdkPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(MonoPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(NodePrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(PhpPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(PowershellPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(PythonPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(RubyPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(RustPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(SbtPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(SwiftPrepareService);

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
