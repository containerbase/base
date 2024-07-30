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
import { HelmInstallService } from '../tools/helm';
import { HelmfileInstallService } from '../tools/helmfile';
import {
  InstallJavaJdkService,
  InstallJavaJreService,
  InstallJavaService,
} from '../tools/java';
import {
  GradleVersionResolver,
  InstallGradleService,
} from '../tools/java/gradle';
import { InstallMavenService, MavenVersionResolver } from '../tools/java/maven';
import {
  JavaJdkVersionResolver,
  JavaJreVersionResolver,
  JavaVersionResolver,
} from '../tools/java/resolver';
import { InstallKubectlService } from '../tools/kubectl';
import { KustomizeInstallService } from '../tools/kustomize';
import { InstallNodeService } from '../tools/node';
import {
  InstallRenovateService,
  InstallYarnService,
  InstallYarnSlimService,
} from '../tools/node/npm';
import {
  NodeVersionResolver,
  NpmVersionResolver,
  YarnVersionResolver,
} from '../tools/node/resolver';
import { InstallNpmBaseService } from '../tools/node/utils';
import {
  ComposerInstallService,
  ComposerVersionResolver,
} from '../tools/php/composer';
import { PipVersionResolver } from '../tools/python/pip';
import { InstallPipBaseService } from '../tools/python/utils';
import { InstallCocoapodsService } from '../tools/ruby/gem';
import { InstallRubyBaseService } from '../tools/ruby/utils';
import { SkopeoInstallService } from '../tools/skopeo';
import { SopsInstallService } from '../tools/sops';
import { logger } from '../utils';
import { InstallLegacyToolService } from './install-legacy-tool.service';
import { INSTALL_TOOL_TOKEN, InstallToolService } from './install-tool.service';
import { TOOL_VERSION_RESOLVER } from './tool-version-resolver';
import { ToolVersionResolverService } from './tool-version-resolver.service';

export type InstallToolType = 'gem' | 'npm' | 'pip';

function prepareInstallContainer(): Container {
  logger.trace('preparing install container');
  const container = new Container();
  container.parent = rootContainer;

  // core services
  container.bind(InstallToolService).toSelf();
  container.bind(InstallLegacyToolService).toSelf();

  // tool services
  container.bind(INSTALL_TOOL_TOKEN).to(ComposerInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallBazeliskService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallBunService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallCocoapodsService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDartService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDockerService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDotnetService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallFlutterService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallFluxService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallGleamService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallGradleService);
  container.bind(INSTALL_TOOL_TOKEN).to(HelmInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(HelmfileInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallJavaService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallJavaJreService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallJavaJdkService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallKubectlService);
  container.bind(INSTALL_TOOL_TOKEN).to(KustomizeInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallMavenService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallNodeService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallRenovateService);
  container.bind(INSTALL_TOOL_TOKEN).to(SkopeoInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(SopsInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallYarnService);
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
  container.bind(TOOL_VERSION_RESOLVER).to(ComposerVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(GradleVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(JavaVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(JavaJreVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(JavaJdkVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(MavenVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(NodeVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(YarnVersionResolver);

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
      case 'pip': {
        @injectable()
        class InstallGenericNpmService extends InstallPipBaseService {
          override readonly name: string = tool;

          override needsPrepare(): boolean {
            return false;
          }

          override async test(version: string): Promise<void> {
            try {
              // some pip packages may not have a `--version` flag
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
      case 'pip': {
        @injectable()
        class GenericPipVersionResolver extends PipVersionResolver {
          override readonly tool: string = tool;
        }
        container.bind(TOOL_VERSION_RESOLVER).to(GenericPipVersionResolver);
        break;
      }
    }
  }
  return await container.get(ToolVersionResolverService).resolve(tool, version);
}
