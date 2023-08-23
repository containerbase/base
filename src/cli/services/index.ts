import { Container } from 'inversify';
import { AptService } from './apt.service';
import { CompressionService } from './compression.service';
import { EnvService } from './env.service';
import { HttpService } from './http.service';
import { PathService } from './path.service';
import { VersionService } from './version.service';

export {
  AptService,
  CompressionService,
  EnvService,
  HttpService,
  PathService,
  VersionService,
};

export const rootContainer = new Container();

rootContainer.bind(AptService).toSelf();
rootContainer.bind(CompressionService).toSelf();
rootContainer.bind(EnvService).toSelf();
rootContainer.bind(HttpService).toSelf();
rootContainer.bind(PathService).toSelf();
rootContainer.bind(VersionService).toSelf();
