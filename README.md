![Build status](https://github.com/containerbase/buildpack/workflows/build/badge.svg)
![Docker Image Size (latest)](https://img.shields.io/docker/image-size/containerbase/buildpack/latest)
![GitHub](https://img.shields.io/github/license/containerbase/buildpack)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/containerbase/buildpack)

# containerbase buildpack

This repository is the source for the Docker Hub image `containerbase/buildpack`.
Commits to `main` branch are automatically built and published.

## Local development

You need a recent [docker](https://www.docker.com) version with [buildx](https://github.com/docker/buildx) [`>= v0.4.0`](https://github.com/docker/buildx/releases/tag/v0.4.0) plugin installed.

You should use

### Base image

If you make changes to the [`src`](./src/) folder or the [`Dockerfile`](./Dockerfile), you need to rebuild the `containerbase/buildpack` image.

```sh
docker buildx bake
```

### Test images

To run one of the tests use the following command, it will run the java tests from [`test/java`](./test/java/).

```sh
TAG=java docker buildx bake test
```

For other test images checkout [`test`](./test/) folder.

### Distro test images

To run the bionic tests use the following command, it will run the test from [`Dockerfile.bionic`](./Dockerfile.bionic).

```sh
TAG=bionic docker buildx bake test-distro
```

## Apt proxy

You can configure an Apt proxy for the build by specifying an `APT_HTTP_PROXY` argument.

Example: `docker build --build-arg APT_HTTP_PROXY=https://apt.company.com . -t my/image`

You can simply export `APT_HTTP_PROXY` to your local env and our build tools will use your apt proxy for `http` sources.

## Custom base image

To use a custom base image with `containerbase/buildpack` checkout [custom-base-image](./docs/custom-base-image.md) docs.

### Custom Root CA Certificates

To add custom root certifactes to the `containerbase/buildpack` base image checkout [custom-root-ca](./docs/custom-root-ca.md) docs.
