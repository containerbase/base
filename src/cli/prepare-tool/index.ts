import { Container, injectable } from 'inversify';
import { logger } from '../utils';
import { BaseService } from './services/base.service';
import { PrepareToolService } from './services/prepare-tool.service';

@injectable()
class Tool1 extends BaseService {
  readonly name = 'tool1';
  run(): Promise<void> | void {
    logger.info(`prepare ${this.name}`);
  }
}

@injectable()
class Tool2 extends BaseService {
  readonly name = 'tool2';
  run(): Promise<void> | void {
    logger.info(`prepare ${this.name}`);
  }
}

export const PREPARE_TOOL_TOKEN = Symbol('PREPARE_TOOL_TOKEN');

export const container = new Container();
container.bind(PrepareToolService).toSelf();
container.bind(PREPARE_TOOL_TOKEN).to(Tool1);
container.bind(PREPARE_TOOL_TOKEN).to(Tool2);
