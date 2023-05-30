import process from 'node:process';
import { type Level, pino } from 'pino';
import pretty from 'pino-pretty';

const level: Level = (process.env.LOG_LEVEL as Level | undefined) ?? 'info';

// TODO: support file and ndjson logging
export const logger = pino({ level }, pretty());
