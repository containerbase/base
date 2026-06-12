import { createReadStream } from 'node:fs';
import { CompactBuilderFactory } from '@nodable/compact-builder';
import { XMLParser } from '@nodable/flexible-xml-parser';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import type { HttpService } from '../../services/http.service.ts';
import { semverCoerce } from '../../utils/index.ts';
import { AndroidSdkRepo } from './schema.ts';

const repoUrl = 'https://dl.google.com/android/repository/repository2-3.xml';

@injectable()
@injectFromHierarchy()
export class AndroidSdkCmdlineToolsInstallService extends BaseInstallService {
  readonly name = 'android-sdk-cmdline-tools';
  override readonly parent = 'java';

  override async install(version: string): Promise<void> {
    const repo = await fetchRepo(this.http);

    const pkg = repo.packages.find(
      (p) => p.path.startsWith('cmdline-tools;') && p.version === version,
    );

    if (!pkg) {
      throw new Error(
        `Unexpected android repo error. Version ${version} not found.`,
      );
    }

    const pkgFile = pkg.archives.find((f) => f.os === 'linux');
    if (!pkgFile) {
      throw new Error(
        `Unexpected android repo error. No linux package for ${version} found.`,
      );
    }

    const file = await this.http.download({
      url: `https://dl.google.com/android/repository/${pkgFile.url}`,
      checksumType: pkgFile.checksumType,
      expectedChecksum: pkgFile.checksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);

    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  override async link(version: string): Promise<void> {
    const src = `${this.pathSvc.versionedToolPath(this.name, version)}/bin`;
    await this.shellwrapper({
      srcDir: src,
      name: 'sdkmanager',
      args: '--sdk_root=$ANDROID_HOME',
    });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn('sdkmanager', ['--version']);
  }

  override validate(version: string): Promise<boolean> {
    return Promise.resolve(semverCoerce(version) !== null);
  }
}

@injectable()
@injectFromHierarchy()
export class AndroidSdkCmdlineToolsVersionResolver extends ToolVersionResolver {
  readonly tool = 'android-sdk-cmdline-tools';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const res = await fetchRepo(this.http);
      const pkg = res.packages.find((p) => p.path === 'cmdline-tools;latest');
      if (pkg) {
        return pkg.version;
      }
    }
    return version;
  }
}

const builder = new CompactBuilderFactory({
  alwaysArray: ['..archives.archive'], // always wrap these tags in arrays
  // forceArray: (matcher, isLeafNode) => matcher.path().endsWith('.product'),
  // forceTextNode: false, // when true, text-only tags always use { '#text': val }
  // textJoint: '', // join string for multiple text nodes in one tag
});

const parser = new XMLParser({
  attributes: {
    prefix: '',
    groupBy: '@',
  },
  skip: {
    attributes: false,
    declaration: true,
    pi: true,
    nsPrefix: true,
    tags: [
      'sdk::sdk-repository.license',
      'sdk::sdk-repository.remotePackage.display-name',
      'sdk::sdk-repository.remotePackage.type-details',
      'sdk::sdk-repository.remotePackage.uses-license',
    ],
  },
  OutputBuilder: builder as any, // https://github.com/nodable/flexible-xml-parser/issues/3
});

let repo: Promise<AndroidSdkRepo> | undefined;

async function fetchRepo(http: HttpService): Promise<AndroidSdkRepo> {
  // load repo only once per run
  const res = (repo ??= _fetchRepo(http));
  return await res;
}

async function _fetchRepo(http: HttpService): Promise<AndroidSdkRepo> {
  const file = await http.download({
    url: repoUrl,
  });
  const xml = await parseXml(file);
  const res = AndroidSdkRepo.parse(xml);
  return res;
}

async function parseXml(filename: string): Promise<unknown> {
  return await parser.parseStream(createReadStream(filename));
}
