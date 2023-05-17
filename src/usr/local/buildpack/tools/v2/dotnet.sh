#!/bin/bash

function prepare_tool() {
  local version_codename

  version_codename=$(get_distro)
  case "$version_codename" in
    "focal") apt_install \
      libc6 \
      libgcc1 \
      libgssapi-krb5-2 \
      libicu66 \
      libssl1.1 \
      libstdc++6 \
      zlib1g \
      ;;
    "jammy") apt_install \
      libc6 \
      libgcc1 \
      libgssapi-krb5-2 \
      libicu70 \
      libssl3 \
      libstdc++6 \
      zlib1g \
      ;;
    *)
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'focal' or 'jammy'." >&2
      exit 1
    ;;
  esac

  local tool_path
  tool_path=$(create_tool_path)

  export_env DOTNET_ROOT "${tool_path}"
  export_env DOTNET_CLI_TELEMETRY_OPTOUT "1"
  export_env DOTNET_SKIP_FIRST_TIME_EXPERIENCE "1"

  mkdir -p "${USER_HOME}/.nuget" > /dev/null
  chown "${USER_NAME}" "${USER_HOME}/.nuget"
  chmod -R g+w "${USER_HOME}/.nuget"
}

function install_tool () {
  local tool_path
  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  curl --retry 3 --retry-all-errors -sSLO https://dot.net/v1/dotnet-install.sh
  bash dotnet-install.sh --install-dir "$tool_path" --no-path --version "$TOOL_VERSION" --skip-non-versioned-files
  rm -f dotnet-install.sh

  # we need write access to some sub dirs for non root
  if [[ $(is_root) -eq 0 ]]; then
    find "$tool_path" -type d -exec chmod g+w {} \;
  fi
}

function link_tool () {
  local tool_path
  tool_path=$(find_tool_path)

  shell_wrapper "${TOOL_NAME}" "${tool_path}"

  dotnet new > /dev/null
  if [[ $(is_root) -eq 0 ]]; then
    su "$USER_NAME" -c 'dotnet new' > /dev/null
  fi

  # command available since net core 3.1
  # https://docs.microsoft.com/en-us/dotnet/core/tools/dotnet-nuget-list-source
  if [[ ${MAJOR} -gt 3 || (${MAJOR} -eq 3 && ${MINOR} -ge 1) ]]; then
    # See https://github.com/NuGet/Home/issues/11607
    dotnet nuget list source > /dev/null
    if [[ $(is_root) -eq 0 ]]; then
      su "$USER_NAME" -c 'dotnet nuget list source' > /dev/null
    fi
  fi

  dotnet --info
}
