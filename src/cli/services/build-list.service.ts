import fs from 'node:fs/promises';
import { bindingScopeValues, inject, injectable } from 'inversify';
import {
  type InstallToolType,
  installToolTypes,
  logger,
} from '../utils/index.ts';
import { PathService } from './path.service.ts';
import type { Tool } from './version.schema.ts';

/** How a build-time install was done: `install-tool` or `install-<type>`. */
export type BuildListType = 'tool' | InstallToolType;

/** An installed tool version, the `i` line of the list. */
export interface BuildListInstall {
  kind: 'i';
  type: BuildListType;
  tool: string;
  version: string;
  /** The parent tool version the tool was installed for. */
  parent?: Tool;
}

/** A command linked from an installed tool version, the `l` line. */
export interface BuildListLink {
  kind: 'l';
  command: string;
  tool: string;
  version: string;
}

/** The current version of a tool, the `c` line. */
export interface BuildListCurrent {
  kind: 'c';
  /** The name the tool is linked as, eg. `java` for `java-jdk`. */
  alias: string;
  tool: string;
  version: string;
  /** The parent tool version the current version was installed for. */
  parent?: Tool;
}

export type BuildListEntry =
  | BuildListInstall
  | BuildListLink
  | BuildListCurrent;

/**
 * The tools installed into the image at build time, which an empty
 * `/opt/containerbase` volume installs again on first use. It is a plain text
 * file, kept in `/var/lib/containerbase/tool.inst` next to `tool.prep` and
 * copied to `/opt/containerbase/.tool.inst`, so a copy of the folder knows its
 * state. It describes the final state of the image: an uninstall removes the
 * version, its commands and, when it was the current one, the current line,
 * the same as it does in the image. The lines are in install order:
 *
 * - `i <type> <tool> <version> [<parent> <parentVersion>]`: an installed version
 * - `l <command> <tool> <version>`: a command the version linked, a later link
 *   of the command replaces it
 * - `c <alias> <tool> <version> [<parent> <parentVersion>]`: the current version
 *   of the tool, only these lines make a version current
 */
@injectable(bindingScopeValues.Singleton)
export class BuildListService {
  @inject(PathService)
  private readonly pathSvc!: PathService;

  /**
   * Reads and parses a list, `file` is the one in `/var/lib/containerbase` by
   * default. A missing file is an empty list, malformed lines are skipped.
   *
   * @throws when the file exists but can't be read
   */
  async read(file = this.pathSvc.toolInstPath): Promise<BuildListEntry[]> {
    return (await readMissingAsEmpty(file))
      .split('\n')
      .map((line) => parseLine(line))
      .filter((entry) => entry !== null);
  }

  /**
   * Records an install which is linked, so it replaces an earlier record of
   * the same version, the current version of the `alias` and the earlier links
   * of the commands it linked. A failure is only logged, the list never fails
   * an install.
   *
   * @param alias - the name the tool is linked as, the tool name by default
   */
  async record(
    install: Omit<BuildListInstall, 'kind'>,
    commands: readonly string[],
    alias = install.tool,
  ): Promise<void> {
    const { tool, version, parent } = install;
    await this.update((list) => {
      const entries = list.filter((entry) => {
        switch (entry.kind) {
          case 'c':
            return entry.alias !== alias;
          case 'l':
            return (
              !commands.includes(entry.command) &&
              !(entry.tool === tool && entry.version === version)
            );
          case 'i':
            return !(
              entry.tool === tool &&
              entry.version === version &&
              entry.parent?.name === parent?.name &&
              entry.parent?.version === parent?.version
            );
        }
      });
      entries.push({ kind: 'i', ...install });
      entries.push({
        kind: 'c',
        alias,
        tool,
        version,
        ...(parent && { parent }),
      });
      for (const command of commands) {
        entries.push({ kind: 'l', command, tool, version });
      }
      return entries;
    });
  }

  /**
   * Removes a tool version from the list, with its commands and, when it is
   * the current version, the current line, as an uninstall does in the image.
   * A failure is only logged.
   */
  async remove(tool: string, version: string): Promise<void> {
    await this.update((entries) =>
      entries.filter(
        (entry) => !(entry.tool === tool && entry.version === version),
      ),
    );
  }

  /**
   * Reads the list, changes it and writes it. A list which can't be read is
   * kept as it is, as writing would replace it with a partial one. A failure
   * is only logged.
   */
  private async update(
    change: (entries: BuildListEntry[]) => BuildListEntry[],
  ): Promise<void> {
    let entries: BuildListEntry[];
    try {
      entries = await this.read();
    } catch (err) {
      logger.warn({ err }, 'cannot read the build-time tool list');
      return;
    }
    await this.write(change(entries));
  }

  /**
   * Writes the list to `/var/lib/containerbase` and the copy to
   * `/opt/containerbase`. A failure is only logged.
   */
  private async write(entries: BuildListEntry[]): Promise<void> {
    const content = entries.map((entry) => formatLine(entry)).join('\n');
    const text = content ? `${content}\n` : '';
    try {
      await fs.writeFile(this.pathSvc.toolInstPath, text);
      await this.pathSvc.writeFile(this.pathSvc.volumeToolInstPath, text);
    } catch (err) {
      logger.warn({ err }, 'cannot write the build-time tool list');
    }
  }
}

/**
 * The text of a list file, empty when it is missing.
 *
 * @throws when the file can't be read for another reason
 */
async function readMissingAsEmpty(file: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw err;
  }
}

/** One line of the list. */
function formatLine(entry: BuildListEntry): string {
  if (entry.kind === 'l') {
    return `l ${entry.command} ${entry.tool} ${entry.version}`;
  }
  const { tool, version, parent } = entry;
  const suffix = parent ? ` ${parent.name} ${parent.version}` : '';
  if (entry.kind === 'c') {
    return `c ${entry.alias} ${tool} ${version}${suffix}`;
  }
  return `i ${entry.type} ${tool} ${version}${suffix}`;
}

/** The entry of a line, `null` for an empty or malformed one. */
function parseLine(line: string): BuildListEntry | null {
  const tokens = line.trim().split(/\s+/);
  const [kind, a, b, c, d, e] = tokens;
  if (kind === 'l' && tokens.length === 4) {
    return { kind, command: a!, tool: b!, version: c! };
  }
  if (kind === 'c' && (tokens.length === 4 || tokens.length === 6)) {
    return {
      kind,
      alias: a!,
      tool: b!,
      version: c!,
      ...(d && e && { parent: { name: d, version: e } }),
    };
  }
  if (
    kind === 'i' &&
    isBuildListType(a) &&
    (tokens.length === 4 || tokens.length === 6)
  ) {
    return {
      kind,
      type: a,
      tool: b!,
      version: c!,
      ...(d && e && { parent: { name: d, version: e } }),
    };
  }
  return null;
}

/** Whether the value is a list type. */
function isBuildListType(value: string | undefined): value is BuildListType {
  return value === 'tool' || installToolTypes.some((t) => t === value);
}
