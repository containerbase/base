import { env } from 'node:process';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import pino, { type TransportTargetOptions, levels, transport } from 'pino';

const level =
  [
    env.CONTAINERBASE_LOG_LEVEL,
    env.CONTAINERBASE_DEBUG ? 'debug' : undefined,
    env.LOG_LEVEL,
  ]
    .filter(isNonEmptyStringAndNotWhitespace)
    .shift() ?? 'info';

const format =
  [env.CONTAINERBASE_LOG_FORMAT, env.LOG_FORMAT]
    .filter(isNonEmptyStringAndNotWhitespace)
    .shift()
    ?.toLowerCase() ?? 'pretty';

const stdoutTransportTarget = format === 'json' ? 'pino/file' : 'pino-pretty';

let fileLevel = 'silent';

const targets: TransportTargetOptions[] = [
  { target: stdoutTransportTarget, level, options: {} },
];

if (isNonEmptyStringAndNotWhitespace(env.CONTAINERBASE_LOG_FILE)) {
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
