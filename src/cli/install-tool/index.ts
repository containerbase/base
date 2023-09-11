import { Container, injectable } from 'inversify';
import { rootContainer } from '../services';
import { InstallBunService } from '../tools/bun';
import { InstallDartService } from '../tools/dart';
import { InstallDockerService } from '../tools/docker';
import { InstallDotnetService } from '../tools/dotnet';
import { InstallFluxService } from '../tools/flux';
import { InstallNodeService } from '../tools/node';
import {
  InstallBowerService,
  InstallCorepackService,
  InstallLernaService,
  InstallNpmService,
  InstallPnpmService,
  InstallRenovateService,
  InstallYarnService,
  InstallYarnSlimService,
} from '../tools/node/npm';
import { InstallNodeBaseService } from '../tools/node/utils';
import {
  InstallBundlerService,
  InstallCocoapodsService,
} from '../tools/ruby/gem';
import { InstallRubyBaseService } from '../tools/ruby/utils';
import { logger } from '../utils';
import { InstallLegacyToolService } from './install-legacy-tool.service';
import { INSTALL_TOOL_TOKEN, InstallToolService } from './install-tool.service';

export type InstallToolType = 'gem' | 'npm';

function prepareContainer(): Container {
  logger.trace('preparing container');
  const container = new Container();
  container.parent = rootContainer;

  // core services
  container.bind(InstallToolService).toSelf();
  container.bind(InstallLegacyToolService).toSelf();

  // tool services
  container.bind(INSTALL_TOOL_TOKEN).to(InstallBowerService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallBunService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallBundlerService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallCocoapodsService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallCorepackService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDartService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDockerService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallDotnetService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallFluxService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallLernaService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallNodeService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallNpmService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallPnpmService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallRenovateService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallYarnService);
  container.bind(INSTALL_TOOL_TOKEN).to(InstallYarnSlimService);

  logger.trace('preparing container done');
  return container;
}

export function installTool(
  tool: string,
  version: string,
  dryRun = false,
  type?: InstallToolType,
): Promise<number | void> {
  const container = prepareContainer();
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
        class InstallGenericNpmService extends InstallNodeBaseService {
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
