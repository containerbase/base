#!/bin/bash

set -e

require_root
check_semver "$TOOL_VERSION"

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: "${TOOL_VERSION}"
  exit 1
fi

DOTNET_INSTALL_DIR=/usr/local/buildpack/${TOOL_NAME}

if [[ -d "${DOTNET_INSTALL_DIR}/sdk/${TOOL_VERSION}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

version_codename=$(get_distro)

case "$version_codename" in
  "bionic") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu60 libssl1.1 libstdc++6 zlib1g;;
  "focal") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu66 libssl1.1 libstdc++6 zlib1g;;
esac


mkdir -p "$DOTNET_INSTALL_DIR"

if [[ -z "${DOTNET_ROOT+x}" ]]; then
  export_env DOTNET_ROOT "${DOTNET_INSTALL_DIR}"
  export_env DOTNET_CLI_TELEMETRY_OPTOUT "1"
  export_env DOTNET_SKIP_FIRST_TIME_EXPERIENCE "1"
fi

curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s - --install-dir "$DOTNET_INSTALL_DIR" --no-path -version "$TOOL_VERSION"

link_wrapper dotnet "$DOTNET_INSTALL_DIR"

# first time experience
dotnet new > /dev/null
su "$USER_NAME" -c 'dotnet new' > /dev/null

su "$USER_NAME" -c "mkdir -p \$HOME/.nuget" > /dev/null

# command available since net core 3.1
# https://docs.microsoft.com/en-us/dotnet/core/tools/dotnet-nuget-list-source
if [[ ${MAJOR} -gt 3 || (${MAJOR} -eq 3 && ${MINOR} -ge 1) ]]; then
  # See https://github.com/NuGet/Home/issues/11607
  dotnet nuget list source > /dev/null
  su "$USER_NAME" -c 'dotnet nuget list source' > /dev/null
fi

chmod -R g+w "$USER_HOME/.nuget"

dotnet --info
