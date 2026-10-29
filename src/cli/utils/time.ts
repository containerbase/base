import { isNonEmptyString, isNumber } from '@sindresorhus/is';
import ms from 'ms';
import { logger } from './logger.ts';

/** Splits a compound time like `1 day 2h` or `1H 30MIN` into its parts. */
const splitRegex = /(?<part>.*?[a-z]+)/i;

/**
 * A month in a time, which `ms` doesn't know: the word in any case, or an
 * uppercase `M` like for Renovate, a lowercase `m` is a minute.
 */
const monthRegex = /^(?<months>\d+)\s*(?:[Mm][Oo][Nn][Tt][Hh][Ss]?|M)$/;

/** A part of a time without a unit, which `ms` reads as milliseconds. */
const unitlessRegex = /^[+-]?\d+(?:\.\d+)?$/;

/** Splits a compound time like `1 day 2h` or `1h30` into its parts. */
function splitTime(time: string): string[] {
  return time
    .split(splitRegex)
    .map((part) => part.trim())
    .filter(isNonEmptyString);
}

/**
 * Checks if a part of a time like `24` or `1h30` has no unit, so it is read
 * as milliseconds.
 */
export function hasUnitlessPart(time: string): boolean {
  return splitTime(time).some((part) => unitlessRegex.test(part));
}

/**
 * Converts a time like `24h`, `2 days` or `1 day 2h` to milliseconds, like
 * Renovate does. The parts of a compound time are summed, a month counts as
 * 30 days.
 * @returns `null` for an invalid time or a negative part, which is logged at
 * debug level
 */
export function toMs(time: string): number | null {
  const specs = splitTime(time).map((spec) =>
    spec.replace(
      monthRegex,
      (_, months: string) => `${Number(months) * 30} days`,
    ),
  );
  if (!specs.length) {
    logger.debug({ time }, `Invalid time specifier: '${time}'`);
    return null;
  }

  let total = 0;
  for (const spec of specs) {
    const millis: unknown = ms(spec as ms.StringValue);
    if (!isNumber(millis)) {
      logger.debug({ time }, `Invalid time specifier: '${spec}'`);
      return null;
    }
    if (millis < 0) {
      logger.debug({ time }, `Negative time specifier: '${spec}'`);
      return null;
    }
    total += millis;
  }
  return total;
}
