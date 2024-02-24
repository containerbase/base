import { Container, injectable } from 'inversify';
import { rootContainer } from '../services';
import { InstallBazeliskService } from '../tools/bazelisk';
import { InstallBunService } from '../tools/bun';
import { InstallDartService } from '../tools/dart';
import { InstallDockerService } from '../tools/docker';
import { InstallDotnetService } from '../tools/dotnet';
import { InstallFlutterService } from '../tools/flutter';
import { InstallFluxService } from '../tools/flux';
import { InstallGleamService } from '../tools/gleam';
import { InstallMavenService } from '../tools/java/maven';
import { InstallNodeService } from '../tools/node';
import {
  InstallRenovateService,
  InstallYarnSlimService,
} from '../tools/node/npm';
import {
  NodeVersionResolver,
  NpmVersionResolver,
} from '../tools/node/resolver';
import { InstallNpmBaseService } from '../tools/node/utils';
import { InstallCocoapodsService } from '../tools/ruby/gem';
import { InstallRubyBaseService } from '../tools/ruby/utils';
import { InstallWallyService } from '../tools/wally';
import { logger } from '../utils';
import { InstallLegacyToolService } from './install-legacy-tool.service';
import { INSTALL_TOOL_TOKEN, InstallToolService } from './install-tool.service';
import { TOOL_VERSION_RESOLVER } from './tool-version-resolver';
import { ToolVersionResolverService } from './tool-version-resolver.service';

export type InstallToolType = 'gem' | 'npm';

function prepareInstallContainer(): Container {
  logger.trace('preparing install container');
  const container = new Container();
  container.parent = rootContainer;

  // core services
  container.bind(InstallToolService).toSelf();
  container.bind(InstallLegacyToolService).toSelf();

  // tool services
  container.bind(INSTALL_TOOL_TOKEN).to(InstallBazeliskService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallBunService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallGleamService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallCocoapodsService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDartService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDockerService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDotnetService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallFlutterService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallFluxService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallMavenService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallNodeService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallRenovateService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallWallyService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallYarnSlimService);

  logger.trace('preparing install container done');
  return container;
}

function prepareResolveContainer(): Container {
  logger.trace('preparing resolve container');
  const container = new Container();
  container.parent = rootContainer;

  // core services
  container.bind(ToolVersionResolverService).toSelf();

  // tool version resolver
  container.bind(TOOL_VERSION_RESOLVER).to(NodeVersionResolver);

  logger.trace('preparing container done');
  return container;
}

export function installTool(
  tool: string,
  version: string,
  dryRun = false,
  type?: InstallToolType,
): Promise<number | void> {
  const container = prepareInstallContainer();
  if (type) {
    switch (type) {
      case 'gem': {
        @injectable()
        class InstallGenericGemService extends InstallRubyBaseService {
          override readonly name: string = tool;

          override needsPrepare(): boolean {
            return false;
          }

          override async test(version: string): Promise<void> {
            try {
              // some npm packages may not have a `--version` flag
              await super.test(version);
            } catch (err) {
              logger.debug(err);
            }
          }
        }
        container.bind(INSTALL_TOOL_TOKEN).to(InstallGenericGemService);
        break;
      }
      case 'npm': {
        @injectable()
        class InstallGenericNpmService extends InstallNpmBaseService {
          override readonly name: string = tool;

          override needsPrepare(): boolean {
            return false;
          }

          override async test(version: string): Promise<void> {
            try {
              // some npm packages may not have a `--version` flag
              await super.test(version);
            } catch (err) {
              logger.debug(err);
            }
          }
        }
        container.bind(INSTALL_TOOL_TOKEN).to(InstallGenericNpmService);
        break;
      }
    }
  }
  return container.get(InstallToolService).execute(tool, version, dryRun);
}

export async function resolveVersion(
  tool: string,
  version: string | undefined,
  type?: InstallToolType,
): Promise<string | undefined> {
  const container = prepareResolveContainer();

  if (type) {
    switch (type) {
      // case 'gem': {
      //   @injectable()
      //   class InstallGenericGemService extends InstallRubyBaseService {
      //     override readonly name: string = tool;

      //     override needsPrepare(): boolean {
      //       return false;
      //     }

      //     override async test(version: string): Promise<void> {
      //       try {
      //         // some npm packages may not have a `--version` flag
      //         await super.test(version);
      //       } catch (err) {
      //         logger.debug(err);
      //       }
      //     }
      //   }
      //   container.bind(INSTALL_TOOL_TOKEN).to(InstallGenericGemService);
      //   break;
      // }
      case 'npm': {
        @injectable()
        class GenericNpmVersionResolver extends NpmVersionResolver {
          override readonly tool: string = tool;
        }
        container.bind(TOOL_VERSION_RESOLVER).to(GenericNpmVersionResolver);
        break;
      }
    }
  }
  return await container.get(ToolVersionResolverService).resolve(tool, version);
}
