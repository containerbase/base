import { Container } from 'inversify';
import { EnvService } from './env.service';
import { PathService } from './path.service';

export { EnvService, PathService };

export const rootContainer = new Container();

rootContainer.bind(EnvService).toSelf();
rootContainer.bind(PathService).toSelf();
