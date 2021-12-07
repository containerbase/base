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

VERSION_CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})

case "$VERSION_CODENAME" in
  "bionic") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu60 libssl1.1 libstdc++6 zlib1g;;
  "focal") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu66 libssl1.1 libstdc++6 zlib1g;;
esac

mkdir -p /usr/local/${TOOL_NAME}/${TOOL_VERSION}
curl -sSL https://github.com/PowerShell/PowerShell/releases/download/v${TOOL_VERSION}/powershell-${TOOL_VERSION}-linux-x64.tar.gz --output ${TOOL_NAME}.tgz
tar --strip 1 -C /usr/local/${TOOL_NAME}/${TOOL_VERSION} -xzf ${TOOL_NAME}.tgz
rm ${TOOL_NAME}.tgz

export_path "/usr/local/${TOOL_NAME}/${TOOL_VERSION}"

pwsh -Version

shell_wrapper pwsh
