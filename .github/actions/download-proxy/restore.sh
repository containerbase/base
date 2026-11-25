#!/bin/bash

# Moves the restored `cdn` cache of the download proxy into place, before
# nginx starts: the files the GitHub Actions cache restored to <folder>, and
# the ghcr.io image of the test if there is one. Large tests are kept on
# ghcr.io, small ones in the GitHub Actions cache, and a test that moved
# between them gets both. A missing or failing image only means a cold cache.
# Usage: restore.sh <folder> <ghcr.io image>

set -e

restored="${1:?folder}"
image="${2:?image}"
cache=/var/cache/containerbase-cdn

sudo mkdir -p "${cache}"
mkdir -p "${restored}"

if docker buildx imagetools inspect "${image}" > /dev/null 2>&1; then
  echo "Restoring ${image}"
  # exports the files of the image, without loading it. The image only holds
  # files and is pushed for linux/amd64, also for the aarch64 tests.
  if ! echo "FROM --platform=linux/amd64 ${image}" | docker buildx build --quiet --output "type=local,dest=${restored}" - > /dev/null; then
    echo "::warning::Failed to restore ${image}, the download cache starts empty"
  fi
fi

if [ -z "$(ls -A "${restored}")" ]; then
  echo "No download cache to restore"
  exit 0
fi

# hard links on the same file system, a copy otherwise
sudo cp -al "${restored}/." "${cache}/" 2> /dev/null || sudo cp -a "${restored}/." "${cache}/"
rm -rf "${restored}"
echo "Restored $(sudo find "${cache}" -type f | wc -l) files, $(sudo du -sh "${cache}" | cut -f1)"
