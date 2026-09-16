# Agent instructions

Guidance for coding agents working in this repository.

## Git workflow

Pull requests land through a GitHub merge queue, which builds them against the
current `main` before merging.
A pull request therefore doesn't need to be up to date with `main`, so only
merge `main` in when something actually needs it, like resolving a conflict or
picking up a change the branch depends on:

```bash
git fetch origin
git merge origin/main
```

Do not rebase a pushed branch onto `main` and force-push it.
A force push rewrites history that reviewers and CI have already seen.

## Commands

All tooling runs through `pnpm`:

- `pnpm install --frozen-lockfile`: install dependencies
- `pnpm vitest run`: run the unit tests
- `pnpm tsc --noEmit`: type check
- `pnpm eslint`: lint
- `pnpm prettier` and `pnpm prettier-fix`: check and fix formatting
- `pnpm lint:markdown`: lint markdown
- `pnpm schema`: regenerate the generated json schemas
- `pnpm test:docker -b -t test-x86_64 node`: run the container test in `test/node`

The container tests build the whole image, so they take several minutes.
