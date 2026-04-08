import { Container, injectFromHierarchy, injectable } from 'inversify';
import { PathService, createContainer } from '../services/index.ts';
import { DartPrepareService } from '../tools/dart/index.ts';
import { DockerPrepareService } from '../tools/docker/index.ts';
import { DotnetPrepareService } from '../tools/dotnet/index.ts';
import { MonoPrepareService } from '../tools/dotnet/mono.ts';
import { PowershellPrepareService } from '../tools/dotnet/powershell.ts';
import { ElixirPrepareService } from '../tools/erlang/elixir.ts';
import { ErlangPrepareService } from '../tools/erlang/index.ts';
import { FlutterPrepareService } from '../tools/flutter.ts';
import { GolangPrepareService } from '../tools/golang.ts';
import { CabalPrepareService } from '../tools/haskell/cabal.ts';
import { GhcPrepareService } from '../tools/haskell/ghc.ts';
import {
  JavaJdkPrepareService,
  JavaJrePrepareService,
  JavaPrepareService,
} from '../tools/java/index.ts';
import { SbtPrepareService } from '../tools/java/sbt.ts';
import { NodePrepareService } from '../tools/node/index.ts';
import { PhpPrepareService } from '../tools/php/index.ts';
import { ConanPrepareService } from '../tools/python/conan.ts';
import { PythonPrepareService } from '../tools/python/index.ts';
import { RubyPrepareService } from '../tools/ruby/index.ts';
import { RustPrepareService } from '../tools/rust.ts';
import { SwiftPrepareService } from '../tools/swift.ts';
import { logger } from '../utils/index.ts';
import { isNotKnownV2Tool } from '../utils/v2-tool.ts';
import { V2ToolPrepareService } from './prepare-legacy-tools.service.ts';
import {
  PREPARE_TOOL_TOKEN,
  PrepareToolService,
} from './prepare-tool.service.ts';

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
  container.bind(PREPARE_TOOL_TOKEN).to(CabalPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(ConanPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(DartPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(DotnetPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(DockerPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(ElixirPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(ErlangPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(FlutterPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(GhcPrepareService);
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
