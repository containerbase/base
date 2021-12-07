#!/usr/bin/env bash

set -e

require_root
check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

if [[ -d "/usr/local/${TOOL_NAME}/${TOOL_VERSION}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

mkdir -p /usr/local/${TOOL_NAME}/${TOOL_VERSION}
curl -sSL https://get.helm.sh/helm-v${TOOL_VERSION}-linux-amd64.tar.gz --output helm.tgz
tar --strip 1 -C /usr/local/${TOOL_NAME}/${TOOL_VERSION} -xzf helm.tgz
rm helm.tgz

export_path "/usr/local/${TOOL_NAME}/${TOOL_VERSION}"

helm version

shell_wrapper helm
