import { builtinModules } from 'node:module';
import { type ESTree, defineRule } from '@oxlint/plugins';

const builtins = new Set(builtinModules);

/**
 * Ranks an import source like the default groups of `import-x/order`:
 * builtin, external, parent, sibling, index and then everything else, like
 * tsconfig path aliases.
 * @param source the module specifier
 * @returns the group rank, lower comes first
 */
function groupRank(source: string): number {
  if (source.startsWith('node:') || builtins.has(source)) {
    return 0;
  }
  if (source === '.' || source === './' || source === './index') {
    return 4;
  }
  if (source.startsWith('./')) {
    return 3;
  }
  if (source === '..' || source.startsWith('../')) {
    return 2;
  }
  if (/^[@a-z0-9]/i.test(source)) {
    return 1;
  }
  return 5;
}

/**
 * Compares two imports by group and then alphabetically by source.
 * @param a the first import
 * @param b the second import
 * @returns a negative number when `a` comes first
 */
function compareImports(
  a: ESTree.ImportDeclaration,
  b: ESTree.ImportDeclaration,
): number {
  const rank = groupRank(a.source.value) - groupRank(b.source.value);
  if (rank !== 0) {
    return rank;
  }
  if (a.source.value === b.source.value) {
    return 0;
  }
  return a.source.value < b.source.value ? -1 : 1;
}

/**
 * Splits the top level statements into runs of imports that may be reordered.
 * Side-effect imports and any other statement end a run, so nothing moves
 * across them.
 * @param body the program body
 * @returns the runs with more than one import
 */
function importRuns(
  body: ESTree.Program['body'],
): ESTree.ImportDeclaration[][] {
  const runs: ESTree.ImportDeclaration[][] = [];
  let run: ESTree.ImportDeclaration[] = [];
  for (const statement of body) {
    if (
      statement.type === 'ImportDeclaration' &&
      statement.specifiers.length > 0
    ) {
      run.push(statement);
      continue;
    }
    if (run.length > 1) {
      runs.push(run);
    }
    run = [];
  }
  if (run.length > 1) {
    runs.push(run);
  }
  return runs;
}

/**
 * Finds the end of the line which contains `pos`.
 * @param text the source text
 * @param pos an offset into the source text
 * @returns the offset of the line break, or the end of the text
 */
function lineEnd(text: string, pos: number): number {
  const end = text.indexOf('\n', pos);
  return end === -1 ? text.length : end;
}

export default defineRule({
  meta: {
    type: 'suggestion',
    fixable: 'code',
    messages: {
      unsorted:
        "Import of '{{source}}' is out of order, imports are grouped by builtin, external, parent, sibling and index modules and sorted alphabetically.",
    },
  },
  createOnce(context) {
    return {
      Program(program) {
        const { text } = context.sourceCode;
        for (const run of importRuns(program.body)) {
          const sorted = run.toSorted(compareImports);
          const first = run.findIndex((node, i) => node !== sorted[i]);
          if (first === -1) {
            continue;
          }

          // Every import owns the lines from the end of the previous import
          // up to the end of its own line, so comments above and trailing
          // comments move with it.
          const start = run[0]!.range[0];
          const end = lineEnd(text, run.at(-1)!.range[1]);
          const segments = new Map<ESTree.ImportDeclaration, string>();
          let fixable = true;
          let segmentStart = start;
          for (const node of run) {
            if (node.range[0] < segmentStart) {
              // two imports share a line
              fixable = false;
              break;
            }
            const segmentEnd = lineEnd(text, node.range[1]);
            segments.set(node, text.slice(segmentStart, segmentEnd));
            segmentStart = segmentEnd + 1;
          }

          // The comments above the first import may be a file header, so
          // they stay where they are and must not be separated from it.
          const headComments = context.sourceCode.getCommentsBefore(run[0]!);
          if (headComments.length > 0 && sorted[0] !== run[0]) {
            fixable = false;
          }

          context.report({
            node: run[first]!,
            messageId: 'unsorted',
            data: { source: run[first]!.source.value },
            ...(fixable && {
              fix: (fixer) =>
                fixer.replaceTextRange(
                  [start, end],
                  sorted.map((node) => segments.get(node)).join('\n'),
                ),
            }),
          });
        }
      },
    };
  },
});
