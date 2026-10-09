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

The merge queue also sets the merge strategy, so don't pass one when merging:
enable auto merge with `gh pr merge <number> --auto`, without `--squash`,
`--merge` or `--rebase`.

Do not rebase a pushed branch onto `main` and force-push it.
A force push rewrites history that reviewers and CI have already seen.

Stacked pull requests managed with `gh stack` are the exception: keep one
commit per layer, update the stack with `gh stack rebase` once a layer below
is merged or `main` is needed, and force-push it with `gh stack push` or
`gh stack submit`.

## Commands

All tooling runs through `pnpm`:

- `pnpm install --frozen-lockfile`: install dependencies
- `pnpm vitest run`: run the unit tests
- `pnpm tsc --noEmit`: type check
- `pnpm oxlint` and `pnpm oxlint-fix`: lint and fix lint findings
- `pnpm prettier` and `pnpm prettier-fix`: check and fix formatting
- `pnpm lint:markdown`: lint markdown
- `mise exec -- jactionlint`: lint the GitHub workflows and local actions
- `pnpm lint:schema`: check the committed json schemas are up to date
- `pnpm schema`: regenerate the committed json schemas
- `pnpm test:docker -b -t test-x86_64 node`: run the container test in `test/node`
- `pnpm test:docker -b -t test-distro noble`: run the distro test from `test/Dockerfile.distro` on noble (omit the distro to run all)

The container tests build the whole image, so they take several minutes.

## Tool installers

When adding or changing a tool installer, follow the [tool installer best practices](./docs/tool-installer-best-practices.md).
