import semver, { type SemVer } from 'semver';
import { type StrictValidator, makeValidator } from 'typanion';

export function isValid(version: string): boolean {
  return semver.valid(version) !== null;
}

export function parse(version: string): SemVer | null {
  return semver.parse(version);
}

export function validateSemver(): StrictValidator<string, string> {
  return makeValidator<string, string>({
    test: (value, state): value is string => {
      const version = semver.valid(value);
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
