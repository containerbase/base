#!/bin/bash

set -e

require_root
check_semver $TOOL_VERSION

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

DOTNET_INSTALL_DIR=/usr/local/dotnet/${TOOL_VERSION}

if [[ -d "${DOTNET_INSTALL_DIR}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

VERSION_CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})

case "$VERSION_CODENAME" in
  "bionic") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu60 libssl1.1 libstdc++6 zlib1g;;
  "focal") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu66 libssl1.1 libstdc++6 zlib1g;;
esac


mkdir -p $DOTNET_INSTALL_DIR
arch=linux-x64
url=https://dotnetcli.azureedge.net/dotnet/Sdk/${TOOL_VERSION}/dotnet-sdk-${TOOL_VERSION}-${arch}.tar.gz
curl -sfL  --output dotnet.tgz $url
tar --strip 1 -C $DOTNET_INSTALL_DIR -xzf dotnet.tgz

export_path "${DOTNET_INSTALL_DIR}"
export_env DOTNET_ROOT "${DOTNET_INSTALL_DIR}"
export_env DOTNET_CLI_TELEMETRY_OPTOUT "1"

# first time experience
dotnet help > /dev/null
su $USER_NAME -c 'dotnet help' > /dev/null

dotnet --info

shell_wrapper dotnet
