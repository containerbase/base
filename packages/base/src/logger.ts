/**
 * A log method, called with a message or with metadata and an optional
 * message, like the methods of a pino or Renovate logger.
 */
export interface LogFn {
  (msg: string): void;
  (meta: Record<string, unknown>, msg?: string): void;
}

/** The logger the package functions log to, see `configure`. */
export interface Logger {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

/** The package options `configure` sets. */
export interface ConfigureOptions {
  /** The logger to log to, nothing is logged without one. */
  logger?: Logger;
}

const noop: LogFn = () => {
  // logging is off
};

const silentLogger: Logger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

let current = silentLogger;

/**
 * Configures the package, eg. sets the logger its functions log to. Options
 * which are left out are reset to their defaults.
 *
 * @param options the options to set
 */
export function configure(options: ConfigureOptions = {}): void {
  current = options.logger ?? silentLogger;
}

/** The logger set by `configure`, a silent one by default. */
export function getLogger(): Logger {
  return current;
}

/**
 * Whether `configure` has set a logger, so a package building on this one can
 * configure a fallback logger itself when nobody else did.
 */
export function isConfigured(): boolean {
  return current !== silentLogger;
}
