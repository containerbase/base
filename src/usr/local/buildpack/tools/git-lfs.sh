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

curl -sSfLo git-lfs.tgz https://github.com/git-lfs/git-lfs/releases/download/v${TOOL_VERSION}/${LFS_FILE}
tar xzvf git-lfs.tgz -C /usr/local/bin git-lfs
rm git-lfs.tgz

git lfs version
git lfs install
