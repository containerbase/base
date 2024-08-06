import { Container, injectable } from 'inversify';
import { rootContainer } from '../services';
import { ResolverMap } from '../tools';
import { BazeliskInstallService } from '../tools/bazelisk';
import { BunInstallService } from '../tools/bun';
import { DartInstallService } from '../tools/dart';
import { DockerInstallService } from '../tools/docker';
import { DotnetInstallService } from '../tools/dotnet';
import { FlutterInstallService } from '../tools/flutter';
import { FluxInstallService } from '../tools/flux';
import { GleamInstallService } from '../tools/gleam';
import { HelmInstallService } from '../tools/helm';
import { HelmfileInstallService } from '../tools/helmfile';
import {
  JavaInstallService,
  JavaJdkInstallService,
  JavaJreInstallService,
} from '../tools/java';
import {
  GradleInstallService,
  GradleVersionResolver,
} from '../tools/java/gradle';
import { MavenInstallService, MavenVersionResolver } from '../tools/java/maven';
import {
  JavaJdkVersionResolver,
  JavaJreVersionResolver,
  JavaVersionResolver,
} from '../tools/java/resolver';
import { KubectlInstallService } from '../tools/kubectl';
import { KustomizeInstallService } from '../tools/kustomize';
import { NodeInstallService } from '../tools/node';
import {
  RenovateInstallService,
  YarnInstallService,
  YarnSlimInstallService,
} from '../tools/node/npm';
import {
  NodeVersionResolver,
  NpmVersionResolver,
  YarnVersionResolver,
} from '../tools/node/resolver';
import { NpmBaseInstallService } from '../tools/node/utils';
import {
  ComposerInstallService,
  ComposerVersionResolver,
} from '../tools/php/composer';
import {
  ConanInstallService,
  ConanVersionResolver,
} from '../tools/python/conan';
import { PipVersionResolver } from '../tools/python/pip';
import { PipBaseInstallService } from '../tools/python/utils';
import { CocoapodsInstallService } from '../tools/ruby/gem';
import { RubyBaseInstallService } from '../tools/ruby/utils';
import { SkopeoInstallService } from '../tools/skopeo';
import { SopsInstallService } from '../tools/sops';
import { logger } from '../utils';
import { LegacyToolInstallService } from './install-legacy-tool.service';
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
  container.bind(LegacyToolInstallService).toSelf();

  // tool services
  container.bind(INSTALL_TOOL_TOKEN).to(ComposerInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(BazeliskInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(BunInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(CocoapodsInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ConanInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DartInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DockerInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DotnetInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(FlutterInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(FluxInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(GleamInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(GradleInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(HelmInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(HelmfileInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(JavaInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(JavaJreInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(JavaJdkInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(KubectlInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(KustomizeInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(MavenInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(NodeInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(RenovateInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(SkopeoInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(SopsInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(YarnInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(YarnSlimInstallService);

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
  container.bind(TOOL_VERSION_RESOLVER).to(ConanVersionResolver);
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
        class InstallGenericGemService extends RubyBaseInstallService {
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
        class InstallGenericNpmService extends NpmBaseInstallService {
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
        class InstallGenericNpmService extends PipBaseInstallService {
          override readonly name: string = tool;

          override needsPrepare(): boolean {
            return false;
          }

          override async test(version: string): Promise<void> {
            try {
              // some pip packages may not have a `--version` flag
              await super.test(version);
            } catch (err) {
              if (ResolverMap[tool] === 'pip') {
                // those tools are known and should work
                throw err;
              }
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
