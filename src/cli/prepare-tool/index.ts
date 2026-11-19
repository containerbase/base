import { join } from 'node:path';
import { Container, injectFromHierarchy, injectable } from 'inversify';
import {
  DataService,
  LinkToolService,
  PathService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { DartPrepareService } from '../tools/dart/index.ts';
import { DockerPrepareService } from '../tools/docker/index.ts';
import { DotnetPrepareService } from '../tools/dotnet/index.ts';
import { MonoPrepareService } from '../tools/dotnet/mono.ts';
import { PowershellPrepareService } from '../tools/dotnet/powershell.ts';
import { ElixirPrepareService } from '../tools/erlang/elixir.ts';
import { ErlangPrepareService } from '../tools/erlang/index.ts';
import { FlutterPrepareService } from '../tools/flutter.ts';
import { GitPrepareService } from '../tools/git/index.ts';
import { GolangPrepareService } from '../tools/golang.ts';
import { CabalPrepareService } from '../tools/haskell/cabal.ts';
import { GhcPrepareService } from '../tools/haskell/ghc.ts';
import {
  JavaJdkPrepareService,
  JavaJrePrepareService,
  JavaPrepareService,
} from '../tools/java/index.ts';
import { SbtPrepareService } from '../tools/java/sbt.ts';
import { JuliaPrepareService } from '../tools/julia.ts';
import { NodePrepareService } from '../tools/node/index.ts';
import { PhpPrepareService } from '../tools/php/index.ts';
import { ConanPrepareService } from '../tools/python/conan.ts';
import { PythonPrepareService } from '../tools/python/index.ts';
import { RubyPrepareService } from '../tools/ruby/index.ts';
import { RustPrepareService } from '../tools/rust.ts';
import { SwiftPrepareService } from '../tools/swift.ts';
import { bindVersionResolvers } from '../tools/version-resolvers.ts';
import { logger, pathExists } from '../utils/index.ts';
import { V2ToolPrepareService } from './prepare-legacy-tools.service.ts';
import {
  PREPARE_TOOL_TOKEN,
  PrepareToolService,
} from './prepare-tool.service.ts';

/**
 * Creates a container with all prepare services, including a generic one for
 * every v2 shell tool.
 */
async function prepareContainer(): Promise<Container> {
  logger.trace('preparing container');
  const container = createContainer();

  // core services
  container.bind(PrepareToolService).toSelf();
  bindVersionResolvers(container);

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
  container.bind(PREPARE_TOOL_TOKEN).to(GitPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(GolangPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaJrePrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JavaJdkPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(JuliaPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(MonoPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(NodePrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(PhpPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(PowershellPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(PythonPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(RubyPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(RustPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(SbtPrepareService);
  container.bind(PREPARE_TOOL_TOKEN).to(SwiftPrepareService);

  // v2 tool services, after the modern ones so a custom v2 shell tool with the
  // same name doesn't replace a modern tool's prepare, like on install
  const pathSvc = await container.getAsync(PathService);
  const v2Tools = await pathSvc.findLegacyTools();
  for (const tool of v2Tools) {
    @injectable()
    @injectFromHierarchy()
    class GenericV2ToolPrepareService extends V2ToolPrepareService {
      override readonly name: string = tool;
    }
    container.bind(PREPARE_TOOL_TOKEN).to(GenericV2ToolPrepareService);
  }

  logger.trace('preparing container done');
  return container;
}

/** Runs the prepare step of the passed tools, or of all tools for `all`. */
export async function prepareTools(
  tools: string[],
  dryRun = false,
): Promise<number | void> {
  const container = await prepareContainer();
  const svc = await container.getAsync(PrepareToolService);
  return svc.prepare(tools, dryRun);
}

/**
 * Recreates the missing pointers of the commands from the links store, for
 * the per-version wrappers which still exist. Nothing is installed. The
 * databases are only read, so they are opened read-only. Failures, eg. a
 * pointer which can't be written or a database which can't be read, are only
 * logged, the shim of the command restores its pointer on its first call.
 */
async function restorePointers(container: Container): Promise<void> {
  try {
    (await container.getAsync(DataService)).readOnly();
    const pathSvc = await container.getAsync(PathService);
    const linkSvc = await container.getAsync(LinkToolService);
    const versionSvc = await container.getAsync(VersionService);

    for (const { name, tool } of await versionSvc.findAllLinks()) {
      if (await pathExists(join(pathSvc.linksPath, name), 'file')) {
        continue;
      }
      try {
        await linkSvc.restorePointer(
          name,
          tool,
          await versionSvc.findParentVersions(tool),
        );
      } catch (err) {
        logger.warn({ err, command: name }, 'cannot restore the pointer');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'cannot restore the pointers');
  }
}

/**
 * Runs the initialize step of the passed tools, or of all prepared tools for
 * `all`. For `all` it also recreates the missing pointers of the commands, see
 * `restorePointers`.
 */
export async function initializeTools(
  tools: string[],
  dryRun = false,
): Promise<number | void> {
  const container = await prepareContainer();
  const svc = await container.getAsync(PrepareToolService);
  const res = await svc.initialize(tools, dryRun);
  if (!res && !dryRun && tools.length === 1 && tools[0] === 'all') {
    await restorePointers(container);
  }
  return res;
}
