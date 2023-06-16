import { Container } from 'inversify';
import { EnvService } from './env.service';
import { HttpService } from './http.service';
import { PathService } from './path.service';
import { VersionService } from './version.service';

export { EnvService, PathService, VersionService, HttpService };

export const rootContainer = new Container();

rootContainer.bind(EnvService).toSelf();
rootContainer.bind(PathService).toSelf();
rootContainer.bind(VersionService).toSelf();
rootContainer.bind(HttpService).toSelf();
