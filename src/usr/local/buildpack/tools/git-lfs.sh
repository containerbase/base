#!/bin/bash

set -e

# Download and install the latest Git LFS
LFS_VERSION=$(curl -s https://api.github.com/repos/git-lfs/git-lfs/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")')
wget "https://github.com/git-lfs/git-lfs/releases/download/${LFS_VERSION}/git-lfs-linux-amd64-${LFS_VERSION}.tar.gz"

TMP_DIR=$(mktemp -d)
tar -xf "git-lfs-linux-amd64-${LFS_VERSION}.tar.gz" -C "${TMP_DIR}" git-lfs install.sh
"${TMP_DIR}"/install.sh
rm -rd "${TMP_DIR}"

git lfs version
