/**
 * The major version of the tool-versions format the schemas of this package
 * describe.
 */
export const toolVersionsFormat = 1;

/**
 * The folder of the format relative to the root of the published
 * tool-versions site, eg. `v1`, for building urls.
 * To pick the format from the root index, match its `version` against
 * `toolVersionsFormat`; its `path` is `v1/`.
 */
export const toolVersionsFormatPath = `v${toolVersionsFormat}`;

const schemaUrlPattern = new RegExp(
  `/${toolVersionsFormatPath}/[^/]+\\.schema\\.json$`,
);

/**
 * Checks if the `$schema` url of a tool-versions file names a schema of the
 * format this package describes, eg.
 * `https://containerbase.github.io/tool-versions/v1/tool.schema.json`.
 * Only the path of the url is checked, its query and fragment are ignored.
 * The protocol and host are not checked, so mirrors work too.
 *
 * @param schemaUrl the `$schema` value of the file
 * @returns `false` for the schema of another format, an invalid url or a
 * missing value
 */
export function isToolVersionsFormat(schemaUrl: string | undefined): boolean {
  if (schemaUrl === undefined) {
    return false;
  }
  try {
    return schemaUrlPattern.test(new URL(schemaUrl).pathname);
  } catch {
    return false;
  }
}
