#!/bin/bash

set -e

require_root
check_semver "$TOOL_VERSION"

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo "Invalid version: ${TOOL_VERSION}"
  exit 1
fi

if [[ -x "$(command -v git-lfs)" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

ARCH=linux-amd64
LFS_FILE="git-lfs-${ARCH}-v${TOOL_VERSION}.tar.gz"
strip=0

# v3.2+ has a subdir https://github.com/git-lfs/git-lfs/pull/4980
if [[ ${MAJOR} -gt 3 || (${MAJOR} -eq 3 && ${MINOR} -ge 2) ]]; then
  strip=1
fi

curl -sSfLo git-lfs.tgz "https://github.com/git-lfs/git-lfs/releases/download/v${TOOL_VERSION}/${LFS_FILE}"
mkdir -p /tmp/git-lfs
bsdtar --strip $strip -C /tmp/git-lfs -xf git-lfs.tgz
mv /tmp/git-lfs/git-lfs /usr/local/bin/
rm git-lfs.tgz
rm -rf /tmp/git-lfs

git lfs version
git lfs install
