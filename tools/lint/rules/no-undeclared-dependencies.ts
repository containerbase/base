import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { type ESTree, defineRule } from '@oxlint/plugins';

const builtins = new Set(builtinModules);

interface Manifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface DeclaredDependencies {
  runtime: Set<string>;
  dev: Set<string>;
}

const manifestCache = new Map<string, DeclaredDependencies | null>();

/**
 * Reads the dependencies declared by the nearest `package.json` above `dir`.
 * @param dir the directory to start the search in
 * @returns the declared dependencies, or `null` when there is no manifest
 */
function findDependencies(dir: string): DeclaredDependencies | null {
  const cached = manifestCache.get(dir);
  if (cached !== undefined) {
    return cached;
  }
  let result: DeclaredDependencies | null = null;
  const file = join(dir, 'package.json');
  if (existsSync(file)) {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    result = {
      runtime: new Set([
        ...(manifest.name ? [manifest.name] : []),
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
      ]),
      dev: new Set(Object.keys(manifest.devDependencies ?? {})),
    };
  } else if (dirname(dir) !== dir) {
    result = findDependencies(dirname(dir));
  }
  manifestCache.set(dir, result);
  return result;
}

/**
 * Extracts the package name from a bare module specifier.
 * @param source the module specifier
 * @returns the package name, or `undefined` for builtin, relative and aliased
 * specifiers
 */
function packageName(source: string): string | undefined {
  if (
    source.startsWith('node:') ||
    builtins.has(source) ||
    !/^[@a-z0-9]/i.test(source)
  ) {
    return undefined;
  }
  const parts = source.split('/');
  return source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

export default defineRule({
  meta: {
    type: 'problem',
    messages: {
      undeclared:
        "'{{name}}' is not declared in the dependencies of package.json.",
      devOnly:
        "'{{name}}' is a devDependency, but this file may only use dependencies.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowDevDependencies: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
  },
  createOnce(context) {
    /**
     * Reports `node` when the package it imports is not declared.
     * @param node the module specifier literal
     */
    function check(node: ESTree.StringLiteral): void {
      const name = packageName(node.value);
      if (!name) {
        return;
      }
      const declared = findDependencies(dirname(context.filename));
      if (!declared || declared.runtime.has(name)) {
        return;
      }
      const options = context.options[0] as
        { allowDevDependencies?: boolean } | undefined;
      if (declared.dev.has(name)) {
        if (!options?.allowDevDependencies) {
          context.report({ node, messageId: 'devOnly', data: { name } });
        }
        return;
      }
      context.report({ node, messageId: 'undeclared', data: { name } });
    }

    return {
      ImportDeclaration(node) {
        if (node.importKind !== 'type') {
          check(node.source);
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source && node.exportKind !== 'type') {
          check(node.source);
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') {
          check(node.source);
        }
      },
      ImportExpression(node) {
        if (
          node.source.type === 'Literal' &&
          typeof node.source.value === 'string'
        ) {
          check(node.source);
        }
      },
    };
  },
});
