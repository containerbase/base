import { env } from 'node:process';
import is from '@sindresorhus/is';
import { type TransportTargetOptions, levels, pino, transport } from 'pino';

const level: string =
  env.CONTAINERBASE_LOG_LEVEL ??
  (env.CONTAINERBASE_DEBUG ? 'debug' : undefined) ??
  env.LOG_LEVEL ??
  'info';

let fileLevel: string = 'silent';

const targets: TransportTargetOptions[] = [
  { target: 'pino-pretty', level, options: {} },
];

if (is.nonEmptyStringAndNotWhitespace(env.CONTAINERBASE_LOG_FILE)) {
  fileLevel = env.CONTAINERBASE_LOG_FILE_LEVEL ?? 'debug';
  targets.push({
    target: 'pino/file',
    level: fileLevel,
    options: {
      destination: env.CONTAINERBASE_LOG_FILE,
    },
  });
}

const transports = transport({
  targets,
});

const numLevel = levels.values[level] ?? Infinity;
const numFileLevel = levels.values[fileLevel] ?? Infinity;
export const logger = pino(
  { level: numLevel < numFileLevel ? level : fileLevel },
  transports,
);
