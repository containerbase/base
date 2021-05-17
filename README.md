![Build status](https://github.com/containerbase/buildpack/workflows/build/badge.svg)
![Docker Image Size (latest)](https://img.shields.io/docker/image-size/containerbase/buildpack/latest)
![GitHub](https://img.shields.io/github/license/containerbase/buildpack)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/containerbase/buildpack)

# containerbase buildpack

This repository is the source for the Docker Hub image `containerbase/buildpack`. Commits to `main` branch are automatically built and published.

## Apt proxy

You can pass a custom temporary Apt proxy at build or runtime when installing new packages via `APT_HTTP_PROXY` arg.
All buildpack tool installer and the `install-apt` command will configure the Proxy for installation and remove it afterwards.

## Custom base image

To use a custom base image with `containerbase/buildpack` checkout [custom-base-image](./docs/custom-base-image.md) docs.

### Custom Root CA Certificates

To add custom root certifactes to the `containerbase/buildpack` base image checkout [custom-root-ca](./docs/custom-root-ca.md) docs.
