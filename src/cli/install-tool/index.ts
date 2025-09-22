import { Container, injectFromHierarchy, injectable } from 'inversify';
import { PathService, createContainer } from '../services';
import { ResolverMap } from '../tools';
import { BazeliskInstallService } from '../tools/bazelisk';
import { BunInstallService } from '../tools/bun';
import { DartInstallService } from '../tools/dart';
import { DenoInstallService } from '../tools/deno';
import { DevboxInstallService } from '../tools/devbox';
import { DockerInstallService } from '../tools/docker';
import { DotnetInstallService } from '../tools/dotnet';
import { ErlangInstallService } from '../tools/erlang';
import { ElixirInstallService } from '../tools/erlang/elixir';
import { FlutterInstallService } from '../tools/flutter';
import { FluxInstallService } from '../tools/flux';
import { GitLfsInstallService } from '../tools/git/lfs';
import { GleamInstallService } from '../tools/gleam';
import { GolangInstallService } from '../tools/golang';
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
import { SbtInstallService } from '../tools/java/sbt';
import { ScalaInstallService } from '../tools/java/scala';
import { JsonnetBundlerInstallService } from '../tools/jb';
import { KubectlInstallService } from '../tools/kubectl';
import { KustomizeInstallService } from '../tools/kustomize';
import { NixInstallService } from '../tools/nix';
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
import { PhpInstallService, PhpVersionResolver } from '../tools/php';
import {
  ComposerInstallService,
  ComposerVersionResolver,
} from '../tools/php/composer';
import { PixiInstallService } from '../tools/pixi';
import { PowershellInstallService } from '../tools/powershell';
import { ProtocInstallService } from '../tools/protoc';
import { PythonInstallService } from '../tools/python';
import {
  ConanInstallService,
  ConanVersionResolver,
} from '../tools/python/conan';
import { PipVersionResolver } from '../tools/python/pip';
import { PoetryVersionResolver } from '../tools/python/poetry';
import { PipBaseInstallService } from '../tools/python/utils';
import { RubyInstallService } from '../tools/ruby';
import {
  CocoapodsInstallService,
  CocoapodsVersionResolver,
} from '../tools/ruby/cocoapods';
import {
  RubyBaseInstallService,
  RubyGemVersionResolver,
} from '../tools/ruby/utils';
import { RustInstallService } from '../tools/rust';
import { SkopeoInstallService } from '../tools/skopeo';
import { SopsInstallService } from '../tools/sops';
import { SwiftInstallService } from '../tools/swift';
import { TerraformInstallService } from '../tools/terraform';
import { VendirInstallService } from '../tools/vendir';
import { WallyInstallService } from '../tools/wally';
import { logger } from '../utils';
import { isNotKnownV2Tool } from '../utils/v2-tool';
import {
  V1ToolInstallService,
  V2ToolInstallService,
} from './install-legacy-tool.service';
import { INSTALL_TOOL_TOKEN, InstallToolService } from './install-tool.service';
import { LinkToolService, type ShellWrapperConfig } from './link-tool.service';
import { TOOL_VERSION_RESOLVER } from './tool-version-resolver';
import { ToolVersionResolverService } from './tool-version-resolver.service';

export type InstallToolType = 'gem' | 'npm' | 'pip';

async function prepareInstallContainer(): Promise<Container> {
  logger.trace('preparing install container');
  const container = createContainer();

  // core services
  container.bind(InstallToolService).toSelf();
  container.bind(V1ToolInstallService).toSelf();
  container.bind(LinkToolService).toSelf();

  // modern tool services
  container.bind(INSTALL_TOOL_TOKEN).to(ComposerInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(BazeliskInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(BunInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(CocoapodsInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ConanInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DartInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DenoInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DevboxInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DockerInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DotnetInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ElixirInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ErlangInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(FlutterInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(FluxInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(GitLfsInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(GleamInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(GolangInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(GradleInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(HelmInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(HelmfileInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(JavaInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(JavaJreInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(JavaJdkInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(JsonnetBundlerInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(KubectlInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(KustomizeInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(MavenInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(NixInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(NodeInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(PhpInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(PixiInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(PowershellInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ProtocInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(PythonInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(RenovateInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(RubyInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(RustInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(SbtInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ScalaInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(SkopeoInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(SopsInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(SwiftInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(TerraformInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(VendirInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(WallyInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(YarnInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(YarnSlimInstallService);

  // v2 tool services
  const pathSvc = await container.getAsync(PathService);
  const legacyTools = await pathSvc.findLegacyTools();
  for (const tool of legacyTools.filter(isNotKnownV2Tool)) {
    @injectable()
    @injectFromHierarchy()
    class GenericInstallService extends V2ToolInstallService {
      override readonly name: string = tool;
    }
    container.bind(INSTALL_TOOL_TOKEN).to(GenericInstallService);
  }

  logger.trace('preparing install container done');
  return container;
}

function prepareResolveContainer(): Container {
  logger.trace('preparing resolve container');
  const container = createContainer();

  // core services
  container.bind(ToolVersionResolverService).toSelf();

  // tool version resolver
  container.bind(TOOL_VERSION_RESOLVER).to(CocoapodsVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(ConanVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(ComposerVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(GradleVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(JavaVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(JavaJreVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(JavaJdkVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(MavenVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(NodeVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(PhpVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(PoetryVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(YarnVersionResolver);

  logger.trace('preparing container done');
  return container;
}

export async function installTool(
  tool: string,
  version: string,
  dryRun = false,
  type?: InstallToolType,
): Promise<number | void> {
  const container = await prepareInstallContainer();
  if (type) {
    switch (type) {
      case 'gem': {
        @injectable()
        @injectFromHierarchy()
        class GenericInstallService extends RubyBaseInstallService {
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
        container.bind(INSTALL_TOOL_TOKEN).to(GenericInstallService);
        break;
      }
      case 'npm': {
        @injectable()
        @injectFromHierarchy()
        class GenericInstallService extends NpmBaseInstallService {
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
        container.bind(INSTALL_TOOL_TOKEN).to(GenericInstallService);
        break;
      }
      case 'pip': {
        @injectable()
        @injectFromHierarchy()
        class GenericInstallService extends PipBaseInstallService {
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
        container.bind(INSTALL_TOOL_TOKEN).to(GenericInstallService);
        break;
      }
    }
  }

  const svc = await container.getAsync(InstallToolService);
  return svc.install(tool, version, dryRun);
}

export async function linkTool(
  tool: string,
  options: ShellWrapperConfig,
): Promise<number | void> {
  const container = await prepareInstallContainer();

  const svc = await container.getAsync(LinkToolService);
  return svc.shellwrapper(tool, options);
}

export async function resolveVersion(
  tool: string,
  version: string | undefined,
  type?: InstallToolType,
): Promise<string | undefined> {
  const container = prepareResolveContainer();

  if (type) {
    switch (type) {
      case 'gem': {
        @injectable()
        @injectFromHierarchy()
        class GenericVersionResolver extends RubyGemVersionResolver {
          override readonly tool: string = tool;
        }
        container.bind(TOOL_VERSION_RESOLVER).to(GenericVersionResolver);
        break;
      }
      case 'npm': {
        @injectable()
        @injectFromHierarchy()
        class GenericVersionResolver extends NpmVersionResolver {
          override readonly tool: string = tool;
        }
        container.bind(TOOL_VERSION_RESOLVER).to(GenericVersionResolver);
        break;
      }
      case 'pip': {
        @injectable()
        @injectFromHierarchy()
        class GenericVersionResolver extends PipVersionResolver {
          override readonly tool: string = tool;
        }
        container.bind(TOOL_VERSION_RESOLVER).to(GenericVersionResolver);
        break;
      }
    }
  }
  const svc = await container.getAsync(ToolVersionResolverService);
  return svc.resolve(tool, version);
}
