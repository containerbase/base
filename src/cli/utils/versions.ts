import semver from 'semver';
import { type StrictValidator, makeValidator } from 'typanion';

export function validateSemver(): StrictValidator<string, string> {
  return makeValidator<string, string>({
    test: (value, state): value is string => {
      const version = semver.valid(value);
      if (version != null) {
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
