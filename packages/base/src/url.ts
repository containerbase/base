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
