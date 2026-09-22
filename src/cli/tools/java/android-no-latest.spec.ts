import fs from 'node:fs/promises';
import { describe, expect, test, vi } from 'vitest';
import { HttpService } from '../../services/index.ts';
import { AndroidSdkCmdlineToolsVersionResolver } from './android.ts';
import { rootPath } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

/**
 * `android.ts` caches the sdk repository in a module level variable, so a
 * single spec file can only ever see one version of it. This one holds the
 * repository without a `cmdline-tools;latest` package, which `android.spec.ts`
 * cannot serve alongside its own fixture.
 */
const repository = `<?xml version="1.0" ?>
<sdk:sdk-repository xmlns:sdk="http://schemas.android.com/sdk/android/repo/repository2/03">
  <license id="android-sdk-license" type="text">Terms and Conditions</license>
  <channel id="channel-0">stable</channel>
  <channel id="channel-1">beta</channel>
  <remotePackage path="cmdline-tools;12.0">
    <type-details/>
    <revision><major>12</major><minor>1</minor></revision>
    <display-name>Android SDK Command-line Tools</display-name>
    <uses-license ref="android-sdk-license"/>
    <channelRef ref="channel-0"/>
    <archives>
      <archive>
        <complete>
          <size>158452866</size>
          <checksum type="sha1">deadbeef</checksum>
          <url>commandlinetools-linux-12.0.zip</url>
        </complete>
        <host-os>linux</host-os>
      </archive>
    </archives>
  </remotePackage>
  <remotePackage path="cmdline-tools;13.0">
    <type-details/>
    <revision><major>13</major><minor>1</minor></revision>
    <display-name>Android SDK Command-line Tools</display-name>
    <uses-license ref="android-sdk-license"/>
    <channelRef ref="channel-0"/>
    <archives>
      <archive>
        <complete>
          <size>158452866</size>
          <checksum type="sha1">deadbeef</checksum>
          <url>commandlinetools-linux-13.0.zip</url>
        </complete>
        <host-os>linux</host-os>
      </archive>
    </archives>
  </remotePackage>
</sdk:sdk-repository>`;

describe('cli/tools/java/android-no-latest', () => {
  test('keeps the requested version without a latest package', async () => {
    vi.spyOn(HttpService.prototype, 'download').mockImplementation(async () => {
      const file = rootPath('repository2-3.xml');
      await fs.writeFile(file, repository);
      return file;
    });
    const { svc } = await toolContext(AndroidSdkCmdlineToolsVersionResolver);

    expect(await svc.resolve('latest')).toBe('latest');
  });
});
