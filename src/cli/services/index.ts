import { Container } from 'inversify';
import { EnvService } from './env.service';
import { PathService } from './path.service';
import { VersionService } from './version.service';

export { EnvService, PathService, VersionService };

export const rootContainer = new Container();

rootContainer.bind(EnvService).toSelf();
rootContainer.bind(PathService).toSelf();
rootContainer.bind(VersionService).toSelf();
