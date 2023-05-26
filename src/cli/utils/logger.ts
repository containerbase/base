import pino, { type Level } from 'pino';
import pretty from 'pino-pretty';
import process from 'node:process';

const level: Level = (process.env.LOG_LEVEL as Level | undefined) ?? 'info';

// TODO: support file and ndjson logging
export const logger = pino({ level }, pretty());
