/**
 * The major version of the tool-versions format the schemas of this package
 * describe.
 */
export const toolVersionsFormat = 1;

/**
 * The folder of the format relative to the root of the published
 * tool-versions site, eg. `v1`.
 */
export const toolVersionsFormatPath = `v${toolVersionsFormat}`;

const schemaUrlPattern = new RegExp(
  `/${toolVersionsFormatPath}/[^/]+\\.schema\\.json$`,
);

/**
 * Checks if the `$schema` url of a tool-versions file names a schema of the
 * format this package describes, eg.
 * `https://containerbase.github.io/tool-versions/v1/tool.schema.json`.
 * The host is not checked, so mirrors work too.
 *
 * @param schemaUrl the `$schema` value of the file
 * @returns `false` for the schema of another format or a missing value
 */
export function isToolVersionsFormat(schemaUrl: string | undefined): boolean {
  return schemaUrl !== undefined && schemaUrlPattern.test(schemaUrl);
}
