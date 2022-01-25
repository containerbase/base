#!/bin/bash

set -e

require_root
check_semver "${TOOL_VERSION}"

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: "${TOOL_VERSION}"
  exit 1
fi


tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  # shellcheck source=/dev/null
  VERSION_CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME}")

  case "$VERSION_CODENAME" in
    "bionic") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu60 libssl1.1 libstdc++6 zlib1g;;
    "focal") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu66 libssl1.1 libstdc++6 zlib1g;;
  esac

  mkdir -p "$tool_path/bin"
  curl -sSL "https://github.com/PowerShell/PowerShell/releases/download/v${TOOL_VERSION}/powershell-${TOOL_VERSION}-linux-x64.tar.gz" --output "${TOOL_NAME}".tgz
  tar --strip 1 -C "$tool_path/bin" -xzf "${TOOL_NAME}".tgz
  rm "${TOOL_NAME}".tgz
fi

link_wrapper pwsh "${tool_path}/bin"

pwsh -Version
