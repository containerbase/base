import { type Bind, Container, ContainerModule } from 'inversify';
import { AptService } from './apt.service.ts';
import { CompressionService } from './compression.service.ts';
import { DataService } from './data.service.ts';
import { EnvService } from './env.service.ts';
import { HttpService } from './http.service.ts';
import { IpcClient, IpcServer } from './ipc.service.ts';
import {
  LinkToolService,
  type ShellWrapperConfig,
} from './link-tool.service.ts';
import { PathService } from './path.service.ts';
import { V2ToolService } from './v2-tool.service.ts';
import { VersionService } from './version.service.ts';

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
