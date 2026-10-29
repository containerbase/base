import { logger } from './logger.ts';

/**
 * The warnings already logged by this process, by message and context, as the
 * env and the tool-versions data are read on every resolve. A module-level set,
 * so the warnings don't depend on a service instance.
 */
const warned = new Set<string>();

/**
 * Logs a warning once per process, like an invalid env value or a tool
 * without data, which would else repeat on every resolve.
 * @param context - the logged context, like the env value or the tool, also
 * part of the key, so another value or tool warns
 */
export function warnOnce(
  message: string,
  context: Record<string, string>,
): void {
  const key = `${message}\0${JSON.stringify(context)}`;
  if (!warned.has(key)) {
    warned.add(key);
    logger.warn(context, message);
  }
}

/** Forgets the warnings already logged by {@link warnOnce}, for tests. */
export function resetWarnings(): void {
  warned.clear();
}
