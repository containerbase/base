import { Container, injectFromHierarchy, injectable } from 'inversify';
import type { ShellWrapperConfig } from '../services/index.ts';
import {
  IpcClient,
  LinkToolService,
  PathService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { ApkoInstallService } from '../tools/apko.ts';
import { BazeliskInstallService } from '../tools/bazelisk.ts';
import { BufInstallService } from '../tools/buf.ts';
import { BunInstallService } from '../tools/bun.ts';
import { DartInstallService } from '../tools/dart/index.ts';
import { DenoInstallService } from '../tools/deno.ts';
import { DevboxInstallService } from '../tools/devbox.ts';
import { BuildxInstallService } from '../tools/docker/buildx.ts';
import { DockerComposeInstallService } from '../tools/docker/compose.ts';
import { DockerInstallService } from '../tools/docker/index.ts';
import { DotnetInstallService } from '../tools/dotnet/index.ts';
import { MonoInstallService } from '../tools/dotnet/mono.ts';
import {
  NugetInstallService,
  NugetVersionResolver,
} from '../tools/dotnet/nuget.ts';
import { PaketInstallService } from '../tools/dotnet/paket.ts';
import { PowershellInstallService } from '../tools/dotnet/powershell.ts';
import { ElixirInstallService } from '../tools/erlang/elixir.ts';
import { ErlangInstallService } from '../tools/erlang/index.ts';
import { FlutterInstallService } from '../tools/flutter.ts';
import { FluxInstallService } from '../tools/flux.ts';
import { GitLfsInstallService } from '../tools/git/lfs.ts';
import { GleamInstallService } from '../tools/gleam.ts';
import { GolangInstallService } from '../tools/golang.ts';
import { CabalInstallService } from '../tools/haskell/cabal.ts';
import { GhcInstallService } from '../tools/haskell/ghc.ts';
import { HelmInstallService } from '../tools/helm.ts';
import { HelmfileInstallService } from '../tools/helmfile.ts';
import { ResolverMap } from '../tools/index.ts';
import {
  GradleInstallService,
  GradleVersionResolver,
} from '../tools/java/gradle.ts';
import {
  JavaInstallService,
  JavaJdkInstallService,
  JavaJreInstallService,
} from '../tools/java/index.ts';
import {
  MavenInstallService,
  MavenVersionResolver,
} from '../tools/java/maven.ts';
import {
  JavaJdkVersionResolver,
  JavaJreVersionResolver,
  JavaVersionResolver,
} from '../tools/java/resolver.ts';
import { SbtInstallService } from '../tools/java/sbt.ts';
import { ScalaInstallService } from '../tools/java/scala.ts';
import { JsonnetBundlerInstallService } from '../tools/jb.ts';
import { KubectlInstallService } from '../tools/kubectl.ts';
import { KustomizeInstallService } from '../tools/kustomize.ts';
import { MiseInstallService, MiseVersionResolver } from '../tools/mise.ts';
import { NixInstallService } from '../tools/nix.ts';
import { NodeInstallService } from '../tools/node/index.ts';
import {
  RenovateInstallService,
  YarnInstallService,
  YarnSlimInstallService,
} from '../tools/node/npm.ts';
import {
  NodeVersionResolver,
  NpmVersionResolver,
  YarnVersionResolver,
} from '../tools/node/resolver.ts';
import { NpmBaseInstallService } from '../tools/node/utils.ts';
import {
  ComposerInstallService,
  ComposerVersionResolver,
} from '../tools/php/composer.ts';
import { PhpInstallService, PhpVersionResolver } from '../tools/php/index.ts';
import { PixiInstallService } from '../tools/pixi.ts';
import { ProtocInstallService } from '../tools/protoc.ts';
import {
  ConanInstallService,
  ConanVersionResolver,
} from '../tools/python/conan.ts';
import { PythonInstallService } from '../tools/python/index.ts';
import { PipVersionResolver } from '../tools/python/pip.ts';
import { PoetryVersionResolver } from '../tools/python/poetry.ts';
import { PipBaseInstallService } from '../tools/python/utils.ts';
import {
  CocoapodsInstallService,
  CocoapodsVersionResolver,
} from '../tools/ruby/cocoapods.ts';
import { RubyInstallService } from '../tools/ruby/index.ts';
import {
  RubyBaseInstallService,
  RubyGemVersionResolver,
} from '../tools/ruby/utils.ts';
import { RustInstallService } from '../tools/rust.ts';
import { SkopeoInstallService } from '../tools/skopeo.ts';
import { SopsInstallService } from '../tools/sops.ts';
import { SwiftInstallService } from '../tools/swift.ts';
import { TerraformInstallService } from '../tools/terraform.ts';
import { TofuInstallService } from '../tools/tofu.ts';
import { VendirInstallService } from '../tools/vendir.ts';
import { WallyInstallService } from '../tools/wally.ts';
import { type InstallToolType, logger } from '../utils/index.ts';
import { isNotKnownV2Tool } from '../utils/v2-tool.ts';
import {
  V1ToolInstallService,
  V2ToolInstallService,
} from './install-legacy-tool.service.ts';
import {
  INSTALL_TOOL_TOKEN,
  InstallToolService,
} from './install-tool.service.ts';
import { ToolVersionResolverService } from './tool-version-resolver.service.ts';
import { TOOL_VERSION_RESOLVER } from './tool-version-resolver.ts';

async function prepareInstallContainer(): Promise<Container> {
  logger.trace('preparing install container');
  const container = createContainer();

  // core services
  container.bind(InstallToolService).toSelf();
  container.bind(V1ToolInstallService).toSelf();

  // modern tool services
  container.bind(INSTALL_TOOL_TOKEN).to(ApkoInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ComposerInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(BazeliskInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(BuildxInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(BunInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(BufInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(CabalInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(CocoapodsInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ConanInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DartInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DenoInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DevboxInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DockerInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DockerComposeInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(DotnetInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ElixirInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(ErlangInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(FlutterInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(FluxInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(GitLfsInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(GhcInstallService);
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
  container.bind(INSTALL_TOOL_TOKEN).to(MiseInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(MonoInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(NixInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(NugetInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(NodeInstallService);
  container.bind(INSTALL_TOOL_TOKEN).to(PaketInstallService);
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
  container.bind(INSTALL_TOOL_TOKEN).to(TofuInstallService);
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
  container.bind(TOOL_VERSION_RESOLVER).to(MiseVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(NodeVersionResolver);
  container.bind(TOOL_VERSION_RESOLVER).to(NugetVersionResolver);
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
    const verSvc = await container.getAsync(VersionService);
    await verSvc.setType(tool, type);
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
  const container = createContainer();

  const svc = await container.getAsync(IpcClient);
  if (!(await svc.hasServer())) {
    logger.debug('ipc server not running, linking tool directly');
    const ltSvc = await container.getAsync(LinkToolService);
    await ltSvc.shellwrapper(tool, options);
    return 0;
  }

  logger.debug('ipc server found, linking tool via ipc');
  await svc.start();
  try {
    return await svc.linkTool(tool, options);
  } finally {
    svc.stop();
  }
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

interface UninstallToolConfig {
  tool: string;
  version?: string | undefined;
  dryRun?: boolean;
  recursive?: boolean;
  type?: InstallToolType | undefined;
}

export async function uninstallTool({
  tool,
  version,
  dryRun = false,
  recursive = false,
}: UninstallToolConfig): Promise<number | void> {
  const container = await prepareInstallContainer();
  const verSvc = await container.getAsync(VersionService);
  for (const { name: tool, type } of await verSvc.getTypes()) {
    switch (type) {
      case 'gem': {
        @injectable()
        @injectFromHierarchy()
        class GenericInstallService extends RubyBaseInstallService {
          override readonly name: string = tool;
        }
        container.bind(INSTALL_TOOL_TOKEN).to(GenericInstallService);
        break;
      }
      case 'npm': {
        @injectable()
        @injectFromHierarchy()
        class GenericInstallService extends NpmBaseInstallService {
          override readonly name: string = tool;
        }
        container.bind(INSTALL_TOOL_TOKEN).to(GenericInstallService);
        break;
      }
      case 'pip': {
        @injectable()
        @injectFromHierarchy()
        class GenericInstallService extends PipBaseInstallService {
          override readonly name: string = tool;
        }
        container.bind(INSTALL_TOOL_TOKEN).to(GenericInstallService);
        break;
      }
    }
  }

  const svc = await container.getAsync(InstallToolService);
  return svc.uninstall(tool, version, dryRun, recursive);
}
