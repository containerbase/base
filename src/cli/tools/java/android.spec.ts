import { beforeAll, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import {
  AndroidSdkCmdlineToolsInstallService,
  AndroidSdkCmdlineToolsVersionResolver,
} from './android.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const baseUrl = 'https://dl.google.com';
const zip = 'cmdline-tools archive';

const repository = `<?xml version="1.0" ?>
<sdk:sdk-repository xmlns:sdk="http://schemas.android.com/sdk/android/repo/repository2/03">
  <license id="android-sdk-license" type="text">Terms and Conditions</license>
  <channel id="channel-0">stable</channel>
  <channel id="channel-1">beta</channel>
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
          <checksum type="sha1">${checksum(zip, 'sha1')}</checksum>
          <url>commandlinetools-linux-13.0.zip</url>
        </complete>
        <host-os>linux</host-os>
      </archive>
      <archive>
        <complete>
          <size>158452866</size>
          <checksum type="sha1">deadbeef</checksum>
          <url>commandlinetools-mac-13.0.zip</url>
        </complete>
        <host-os>macosx</host-os>
      </archive>
    </archives>
  </remotePackage>
  <remotePackage path="cmdline-tools;latest">
    <type-details/>
    <revision><major>19</major><minor>2</minor></revision>
    <display-name>Android SDK Command-line Tools (latest)</display-name>
    <uses-license ref="android-sdk-license"/>
    <channelRef ref="channel-0"/>
    <archives>
      <archive>
        <complete>
          <size>158452866</size>
          <checksum type="sha1">deadbeef</checksum>
          <url>commandlinetools-win-19.0.zip</url>
        </complete>
        <host-os>windows</host-os>
      </archive>
    </archives>
  </remotePackage>
</sdk:sdk-repository>`;

/**
 * The repository is fetched once per run and cached in the module, so only the
 * first test that needs it mocks the download.
 */
describe('cli/tools/java/android', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
    execaMock.mockResolvedValue({ failed: false });
  });

  test('install', async () => {
    const { svc, pathSvc } = await toolContext(
      AndroidSdkCmdlineToolsInstallService,
    );
    scope(baseUrl)
      .get('/android/repository/repository2-3.xml')
      .reply(200, repository)
      .get('/android/repository/commandlinetools-linux-13.0.zip')
      .reply(200, zip);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install('13.1')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining('commandlinetools-linux-13.0.zip'),
      cwd: pathSvc.versionedToolPath('android-sdk-cmdline-tools', '13.1'),
      strip: 1,
    });
  });

  test('install: throws for an unknown version', async () => {
    const { svc } = await toolContext(AndroidSdkCmdlineToolsInstallService);

    await expect(svc.install('99.0')).rejects.toThrow(
      'Unexpected android repo error. Version 99.0 not found.',
    );
  });

  test('install: throws without a linux package', async () => {
    const { svc } = await toolContext(AndroidSdkCmdlineToolsInstallService);

    await expect(svc.install('19.2')).rejects.toThrow(
      'Unexpected android repo error. No linux package for 19.2 found.',
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(
      AndroidSdkCmdlineToolsInstallService,
    );
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('13.1')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('android-sdk-cmdline-tools', {
      srcDir: `${pathSvc.versionedToolPath('android-sdk-cmdline-tools', '13.1')}/bin`,
      name: 'sdkmanager',
      args: '--sdk_root=$ANDROID_HOME',
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(AndroidSdkCmdlineToolsInstallService);

    await expect(svc.test('13.1')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'sdkmanager',
      ['--version'],
      expect.any(Object),
    );
  });

  test('validate coerces the two part versions', async () => {
    const { svc } = await toolContext(AndroidSdkCmdlineToolsInstallService);

    expect(await svc.validate('13.1')).toBe(true);
    expect(await svc.validate('not-a-version')).toBe(false);
  });

  describe('AndroidSdkCmdlineToolsVersionResolver', () => {
    test('resolves latest', async () => {
      const { svc } = await toolContext(AndroidSdkCmdlineToolsVersionResolver);

      expect(await svc.resolve('latest')).toBe('19.2');
    });

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(AndroidSdkCmdlineToolsVersionResolver);

      expect(await svc.resolve('13.1')).toBe('13.1');
    });
  });
});
