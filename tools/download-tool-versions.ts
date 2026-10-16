import { installToolVersions, toolVersionsDir } from './tool-versions.ts';

// downloads the data on its own, so the tests can run without a full build
await installToolVersions(toolVersionsDir);
