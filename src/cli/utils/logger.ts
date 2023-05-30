import { env } from 'node:process';
import { type Level, pino } from 'pino';
import pretty from 'pino-pretty';

const level: Level = (env.LOG_LEVEL as Level | undefined) ?? 'info';

// TODO: support file and ndjson logging
export const logger = pino({ level }, pretty());
