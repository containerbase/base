import { Module } from '@nestjs/common';
import { logger } from '../utils';
import { PREPARE_TOOL_TOKEN } from './common';
import { BaseService } from './services/base.service';
import { PrepareToolService } from './services/prepare-tool.service';

class Tool1 extends BaseService {
  readonly name = 'tool1';
  run(): Promise<void> | void {
    logger.info(`prepare ${this.name}`);
  }
}

class Tool2 extends BaseService {
  readonly name = 'tool2';
  run(): Promise<void> | void {
    logger.info(`prepare ${this.name}`);
  }
}

const tools = [Tool1, Tool2];

@Module({
  providers: [
    PrepareToolService,
    ...tools,
    {
      provide: PREPARE_TOOL_TOKEN,
      useFactory: (...args) => args,
      inject: tools,
    },
  ],
})
export class PrepareToolModule {}
