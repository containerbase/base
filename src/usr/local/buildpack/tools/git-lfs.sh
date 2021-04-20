#!/bin/bash

set -e

require_root
check_semver "$TOOL_VERSION"

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo "Invalid version: ${TOOL_VERSION}"
  exit 1
fi

if ! [ "$(command -v git-lfs)" ]; then
  echo "Skipping, already installed"
  exit 0
fi

LFS_FILE="git-lfs-linux-amd64-${TOOL_VERSION}.tar.gz"
wget "https://github.com/git-lfs/git-lfs/releases/download/${TOOL_VERSION}/${LFS_FILE}"

TMP_DIR=$(mktemp -d)
tar -xf "${LFS_FILE}" -C "${TMP_DIR}" git-lfs install.sh
"${TMP_DIR}"/install.sh
rm -rd "${TMP_DIR}"

git lfs version
