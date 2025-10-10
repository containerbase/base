import { type Bind, Container, ContainerModule } from 'inversify';
import { AptService } from './apt.service';
import { CompressionService } from './compression.service';
import { DataService } from './data.service';
import { EnvService } from './env.service';
import { HttpService } from './http.service';
import { IpcClient, IpcServer } from './ipc.service';
import { LinkToolService, type ShellWrapperConfig } from './link-tool.service';
import { PathService } from './path.service';
import { V2ToolService } from './v2-tool.service';
import { VersionService } from './version.service';

export {
  AptService,
  CompressionService,
  EnvService,
  HttpService,
  PathService,
  V2ToolService,
  VersionService,
  LinkToolService,
  type ShellWrapperConfig,
  IpcClient,
  IpcServer,
};

function init<T extends { bind: Bind }>(options: T): void {
  options.bind(AptService).toSelf();
  options.bind(CompressionService).toSelf();
  options.bind(DataService).toSelf();
  options.bind(EnvService).toSelf();
  options.bind(HttpService).toSelf();
  options.bind(PathService).toSelf();
  options.bind(V2ToolService).toSelf();
  options.bind(VersionService).toSelf();
  options.bind(LinkToolService).toSelf();
  options.bind(IpcServer).toSelf();
  options.bind(IpcClient).toSelf();
}

export const rootContainerModule = new ContainerModule(init);

const rootContainer = new Container();
init(rootContainer);

export function createContainer(parent = rootContainer): Container {
  return new Container({ parent });
}
