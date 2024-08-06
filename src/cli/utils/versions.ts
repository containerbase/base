import type SemVer from 'semver/classes/semver';
import semverCoerce from 'semver/functions/coerce';
import semverGte from 'semver/functions/gte';
import semverParse from 'semver/functions/parse';
import semverSatisfies from 'semver/functions/satisfies';
import semverSort from 'semver/functions/sort';
import semverValid from 'semver/functions/valid';
import { type StrictValidator, makeValidator } from 'typanion';

export { semverGte, semverSort, semverCoerce, semverSatisfies };

export function isValid(version: string): boolean {
  return semverValid(version) !== null;
}

export function parse(version: string | undefined): SemVer {
  const res = semverParse(version);
  if (!res) {
    throw new Error(`Invalid version: ${version}`);
  }
  return res;
}

export function validateSemver(): StrictValidator<string, string> {
  return makeValidator<string, string>({
    test: (value, state): value is string => {
      const version = semverValid(value);
      if (version !== null) {
        if (state?.coercions) {
          if (!state.coercion) {
            state.errors?.push(`${state?.p ?? '.'}: Unbound coercion result`);
            return false;
          }
          state.coercions.push([
            state.p ?? '.',
            state.coercion.bind(null, version),
          ]);
        }
        return true;
      }

      state?.errors?.push(`${state?.p ?? '.'}: must be a valid semver version`);
      return false;
    },
  });
}

export function validateVersion(): StrictValidator<string, string> {
  return makeValidator<string, string>({
    test: (value, state): value is string => {
      if (value.startsWith('v')) {
        if (state?.coercions) {
          if (!state.coercion) {
            state.errors?.push(`${state?.p ?? '.'}: Unbound coercion result`);
            return false;
          }
          state.coercions.push([
            state.p ?? '.',
            state.coercion.bind(null, value.slice(1)),
          ]);
        }
      }
      return true;
    },
  });
}
