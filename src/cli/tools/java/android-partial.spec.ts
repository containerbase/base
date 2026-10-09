import { beforeEach, describe, expect, test } from 'vitest';
import { AndroidSdkCmdlineToolsVersionResolver } from './android.ts';
import { scope } from '~test/http-mock.ts';
import { toolContext } from '~test/tool.ts';

/**
 * `android.ts` caches the sdk repository in a module level variable, so a
 * single spec file can only ever see one version of it. This one holds a
 * repository with several versions to resolve partial versions from.
 */

/** A repository package, the revision is written without trailing zeros. */
function remotePackage(
  path: string,
  major: number,
  minor: number | undefined,
  channel = 'channel-0',
): string {
  const minorTag = minor === undefined ? '' : `<minor>${minor}</minor>`;
  return `
  <remotePackage path="${path}">
    <type-details/>
    <revision><major>${major}</major>${minorTag}</revision>
    <display-name>Android SDK Command-line Tools</display-name>
    <uses-license ref="android-sdk-license"/>
    <channelRef ref="${channel}"/>
    <archives>
      <archive>
        <complete>
          <size>1</size>
          <checksum type="sha1">deadbeef</checksum>
          <url>commandlinetools-linux-${major}.zip</url>
        </complete>
        <host-os>linux</host-os>
      </archive>
    </archives>
  </remotePackage>`;
}

const repository = `<?xml version="1.0" ?>
<sdk:sdk-repository xmlns:sdk="http://schemas.android.com/sdk/android/repo/repository2/03">
  <license id="android-sdk-license" type="text">Terms and Conditions</license>
  <channel id="channel-0">stable</channel>
  <channel id="channel-1">beta</channel>
  ${remotePackage('cmdline-tools;11.0', 11, undefined)}
  ${remotePackage('cmdline-tools;12.0', 12, undefined)}
  ${remotePackage('cmdline-tools;12.1', 12, 1)}
  ${remotePackage('cmdline-tools;13.0', 13, undefined)}
  ${remotePackage('cmdline-tools;14.1', 14, 1)}
  ${remotePackage('cmdline-tools;14.3', 14, 3)}
  ${remotePackage('cmdline-tools;15.1', 15, 1, 'channel-1')}
  ${remotePackage('cmdline-tools;16.0', 16, undefined)}
  ${remotePackage('cmdline-tools;16.10', 16, 10)}
  ${remotePackage('cmdline-tools;16.2', 16, 2)}
  ${remotePackage('cmdline-tools;17.0', 17, undefined, 'channel-1')}
  ${remotePackage('cmdline-tools;160.0', 160, undefined)}
  ${remotePackage('cmdline-tools;latest', 16, 10)}
  ${remotePackage('platforms;android-35', 18, undefined)}
</sdk:sdk-repository>`;

describe('cli/tools/java/android-partial', () => {
  beforeEach(() => {
    // the repository is fetched once per run and cached in the module, so the
    // first test serves it and the rest reuse the cache
    scope('https://dl.google.com')
      .get('/android/repository/repository2-3.xml')
      .optionally()
      .reply(200, repository);
  });

  test.each([
    // existing releases are kept, in the form the repository lists them
    { version: '16', expected: '16' },
    { version: '16.2', expected: '16.2' },
    { version: '12', expected: '12' },
    { version: '11', expected: '11' },
    // a listed `13` is `13.0`
    { version: '13', expected: '13' },
    { version: '13.0', expected: '13' },
    { version: '16.0', expected: '16' },
    { version: '160', expected: '160' },
    // an existing beta release is kept too
    { version: '17', expected: '17' },
    // no `14` release, so the newest stable 14.x
    { version: '14', expected: '14.3' },
  ])('resolves $version to $expected', async ({ version, expected }) => {
    const { svc } = await toolContext(AndroidSdkCmdlineToolsVersionResolver);

    expect(await svc.resolve(version)).toBe(expected);
  });

  test.each([
    // only a beta package
    '15',
    // no such package, even though a platform with that revision exists
    '18',
    '16.3',
    '13.1',
    // 14.1 and 14.3 are no 14.0 release
    '14.0',
    '1',
  ])('throws for %s without a matching stable package', async (version) => {
    const { svc } = await toolContext(AndroidSdkCmdlineToolsVersionResolver);

    await expect(svc.resolve(version)).rejects.toThrow(
      `No android-sdk-cmdline-tools release found for version ${version}`,
    );
  });

  test('keeps a full version', async () => {
    const { svc } = await toolContext(AndroidSdkCmdlineToolsVersionResolver);

    expect(await svc.resolve('16.10.1')).toBe('16.10.1');
  });
});
