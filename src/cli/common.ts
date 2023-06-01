import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrepareToolModule } from './prepare-tool/module';
import type { CliMode } from './utils';

export function createApp(mode: CliMode): Promise<INestApplicationContext> {
  if (mode === 'prepare-tool') {
    return NestFactory.createApplicationContext(PrepareToolModule, {
      logger: false, // disable NestJS default logger
    });
  }

  throw new Error(`Unsupported CLI mode: ${mode}`);
}
