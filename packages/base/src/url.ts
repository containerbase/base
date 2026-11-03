/** A url replacement: the text to replace and its replacement. */
export type UrlReplacement = [from: string, to: string];

/** The url replacements read from the environment. */
export interface UrlReplacements {
  /** The valid replacements, in numerical order. */
  replacements: UrlReplacement[];
  /**
   * The `URL_REPLACE_<n>_FROM` variables which are ignored, because they or
   * their `URL_REPLACE_<n>_TO` counterpart are empty or missing.
   */
  invalid: string[];
}

const fromRe = /^URL_REPLACE_\d+_FROM$/;

const collator = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true,
});

/**
 * Reads the url replacements from the `URL_REPLACE_<n>_FROM` and
 * `URL_REPLACE_<n>_TO` variables, in numerical order of `<n>`.
 *
 * @param env the environment to read, `process.env` by default
 */
export function getUrlReplacements(
  env: Record<string, string | undefined> = process.env,
): UrlReplacements {
  const result: UrlReplacements = { replacements: [], invalid: [] };

  for (const from of Object.keys(env)
    .filter((key) => fromRe.test(key))
    .sort((a, b) => collator.compare(a, b))) {
    const to = from.replace(/_FROM$/, '_TO');
    const fromValue = env[from];
    const toValue = env[to];
    if (fromValue && toValue) {
      result.replacements.push([fromValue, toValue]);
    } else {
      result.invalid.push(from);
    }
  }

  return result;
}

/**
 * Replaces a url the way containerbase does for its downloads: with a `cdn`,
 * `https://` is replaced by it first, eg. `https://example.com/file` becomes
 * `<cdn>/example.com/file`. Then every replacement is applied in order, each
 * replacing the first occurrence of its `from` text.
 *
 * @param url the url to replace
 * @param replacements the replacements, see `getUrlReplacements`
 * @param cdn the cdn url, eg. from `CONTAINERBASE_CDN`, skipped when empty
 * @returns the replaced url
 */
// TODO: match only at the start of the url in the next major, like `replaceUrlPrefix` (#8160)
export function replaceUrl(
  url: string,
  replacements: readonly UrlReplacement[],
  cdn?: string,
): string {
  let result = url;

  if (cdn) {
    result = result.replace(/^https:\//, cdn.replace(/\/$/, ''));
  }

  for (const [from, to] of replacements) {
    result = result.replace(from, to);
  }

  return result;
}

/** A url prefix replacement rule, other fields are kept as they are. */
export interface UrlPrefixRule {
  /** The url prefix to replace. */
  from: string;
  /** Its replacement. */
  to: string;
}

/** The result of `replaceUrlPrefix`. */
export interface UrlPrefixResult<T extends UrlPrefixRule> {
  /** The replaced url. */
  url: string;
  /** The rules which matched, in order. */
  applied: T[];
}

/**
 * Replaces url prefixes: the rules are applied in order, each one to the
 * result of the previous ones, and a rule only applies when the url starts
 * with its `from`, which is then replaced by its `to`. Unlike `replaceUrl`,
 * a `from` elsewhere in the url never matches, and there is no cdn.
 *
 * @param url the url to replace
 * @param rules the rules, in order
 * @returns the replaced url and the rules which matched
 */
export function replaceUrlPrefix<T extends UrlPrefixRule>(
  url: string,
  rules: readonly T[],
): UrlPrefixResult<T> {
  let result = url;
  const applied: T[] = [];

  for (const rule of rules) {
    if (result.startsWith(rule.from)) {
      result = rule.to + result.slice(rule.from.length);
      applied.push(rule);
    }
  }

  return { url: result, applied };
}
