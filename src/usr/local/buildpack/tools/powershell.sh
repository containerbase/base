#!/bin/bash

set -e

require_root
check_semver ${TOOL_VERSION}

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

if [[ -d "/usr/local/powershell/${TOOL_VERSION}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

VERSION_CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})

case "$VERSION_CODENAME" in
  "bionic") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu60 libssl1.1 libstdc++6 zlib1g;;
  "focal") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu66 libssl1.1 libstdc++6 zlib1g;;
esac

mkdir -p /usr/local/powershell/${TOOL_VERSION}
curl -sSL https://github.com/PowerShell/PowerShell/releases/download/v${TOOL_VERSION}/powershell-${TOOL_VERSION}-linux-x64.tar.gz --output powershell.tgz
tar --strip 1 -C /usr/local/powershell/${TOOL_VERSION} -xzf powershell.tgz
rm powershell.tgz

export_path "/usr/local/powershell/${TOOL_VERSION}"

pwsh -Version

shell_wrapper pwsh
