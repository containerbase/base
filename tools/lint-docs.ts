import { readFile, readdir } from 'node:fs/promises';
import { DeprecatedTools, ResolverMap } from '../src/cli/tools/index.ts';

// checks that the "Known tools" lists of the package manager sections in
// `docs/custom-registries.md` match the tools installed via those managers

const docsFile = 'docs/custom-registries.md';

/** The install service base class of each package manager. */
const baseClasses = {
  npm: 'NpmBaseInstallService',
  pip: 'PipBaseInstallService',
  gem: 'RubyBaseInstallService',
} as const;

type Manager = keyof typeof baseClasses;

let failed = false;

/** Reports a problem and makes the script exit non zero. */
function fail(message: string): void {
  console.error(`${docsFile}: ${message}`);
  failed = true;
}

/** Reads a file from the repository root. */
async function read(file: string): Promise<string> {
  return await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
}

/** Lists the tools that are mapped to the given package manager. */
function mappedTools(manager: Manager): string[] {
  return Object.entries({ ...ResolverMap, ...DeprecatedTools })
    .filter(([, type]) => type === manager)
    .map(([name]) => name);
}

/**
 * Finds the tools with a dedicated install service by scanning the sources for
 * `class <Name> extends <BaseClass>` followed by its `name` property.
 */
async function serviceTools(manager: Manager): Promise<string[]> {
  const pattern = new RegExp(
    `extends ${baseClasses[manager]} \\{\\s*override readonly name(?:: string)? = '(?<name>[^']+)'`,
    'g',
  );
  const dir = new URL('../src/cli/tools/', import.meta.url);
  const files = await readdir(dir, { recursive: true });
  const tools: string[] = [];

  for (const file of files) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) {
      continue;
    }
    const source = await readFile(new URL(file, dir), 'utf8');
    for (const match of source.matchAll(pattern)) {
      tools.push(match.groups!.name!);
    }
  }
  return tools;
}

/** Reads the "Known tools" list of the `<manager>` tools section. */
function listedTools(docs: string, manager: Manager): string[] | undefined {
  const heading = `### \`${manager}\` tools`;
  const start = docs.indexOf(`\n${heading}\n`);
  if (start === -1) {
    return undefined;
  }
  const section = docs.slice(start + heading.length + 1).split(/\n#/)[0]!;
  const list = /^Known tools:\n\n(?<list>(?:- `[^`]+`\n?)+)/m.exec(section);
  return list?.groups?.list
    ?.split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3, -1));
}

const docs = await read(docsFile);

for (const manager of Object.keys(baseClasses) as Manager[]) {
  const listed = listedTools(docs, manager);
  if (!listed) {
    fail(`no "Known tools" list found in the \`${manager}\` tools section`);
    continue;
  }

  const mapped = mappedTools(manager);
  const installed = new Set([...mapped, ...(await serviceTools(manager))]);

  for (const tool of installed) {
    if (!listed.includes(tool)) {
      fail(
        `\`${tool}\` is installed via ${manager} but missing from the \`${manager}\` tools list`,
      );
    }
  }
  for (const tool of listed) {
    if (!installed.has(tool)) {
      fail(
        `\`${tool}\` is listed in the \`${manager}\` tools list but not installed via ${manager}`,
      );
    }
  }

  const sorted = listed.toSorted();
  if (listed.join() !== sorted.join()) {
    fail(
      `the \`${manager}\` tools list is not sorted alphabetically, expected: ${sorted.join(', ')}`,
    );
  }
}

if (failed) {
  process.exitCode = 1;
}
