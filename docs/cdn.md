# Containerbase CDN

We provide a CDN for all tools.
This is an experimental feature and might be changed at any time.
It can be combined with [url replacements](./custom-registries.md).
The replacements are applied after the CDN is resolved.

## Usage

Set the `CONTAINERBASE_CDN` environment variable to the CDN URL before calling any containerbase tools.

All urls will be resolved to the CDN URL.

## Additional configuration

The package managers `gem`, `npm`, `pip` need to be configured to use the CDN explicitly via the following environment variables:

- `CONTAINERBASE_CDN_GEM=true`
- `CONTAINERBASE_CDN_NPM=true`
- `CONTAINERBASE_CDN_PIP=true`

## Sample

With the folling sample the `java` tool will be installed from the CDN.

```bash
export CONTAINERBASE_CDN=https://cdn.example.test
install-tool java
```

The following urls will be called:

- `https://cdn.example.test/api.adoptium.net/v3/info/release_versions?...` (fetch latest Java LTS)
- `https://cdn.example.test/api.adoptium.net/v3/assets/version/{version}?...` (resolve download url)
- `https://cdn.example.test/github.com/adoptium/temurin{major}-binaries/releases/...` (download the binary)
