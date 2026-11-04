import type { Tool } from './version.schema.ts';

/**
 * The `parent_name` and `parent_version` column values of a parent, `''`
 * without a parent.
 */
export function parentColumns(parent?: Tool): [string, string] {
  return [parent?.name ?? '', parent?.version ?? ''];
}

/**
 * The named `parent_name` and `parent_version` parameters of the parent filter
 * in `version.service.ts`, `null` matches any parent.
 */
export function parentParams(parent?: Tool): {
  parent_name: string | null;
  parent_version: string | null;
} {
  return {
    parent_name: parent?.name ?? null,
    parent_version: parent?.version ?? null,
  };
}

/** The parent of a row, `''` means none. */
export function toParent(name: string, version: string): { parent?: Tool } {
  return name ? { parent: { name, version } } : {};
}
