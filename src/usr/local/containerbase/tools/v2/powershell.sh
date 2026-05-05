#!/bin/bash

function prepare_tool() {
  local version_codename

  version_codename="$(get_distro)"
  case "${version_codename}" in
    # https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu-install?tabs=dotnet10&pivots=os-linux-ubuntu-2204#dependencies-4
    "jammy") apt_install libc6 libgcc-s1 libgssapi-krb5-2 libicu70 libssl3 libstdc++6 tzdata zlib1g;;
    "noble") apt_install libc6 libgcc-s1 libgssapi-krb5-2 libicu74 libssl3t64 libstdc++6 tzdata zlib1g;;
    "resolute") apt_install libbrotli1 libc6 libgcc-s1 libgssapi-krb5-2 libicu78 libssl3t64 libstdc++6 tzdata zlib1g;;
    *)
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'noble' or 'resolute'." >&2
      exit 1
    ;;
  esac
}

function install_tool () {
  local file
  local versioned_tool_path
  local arch=linux-x64

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux-arm64
  fi

  file=$(get_from_url "https://github.com/PowerShell/PowerShell/releases/download/v${TOOL_VERSION}/powershell-${TOOL_VERSION}-${arch}.tar.gz")

  versioned_tool_path=$(create_versioned_tool_path)
  bsdtar -C "${versioned_tool_path}" -xzf "${file}"
  # Happened on v7.3.0
  if [[ ! -x "${versioned_tool_path}/pwsh" ]]; then
    chmod +x "${versioned_tool_path}/pwsh"
  fi
}

function link_tool () {
  shell_wrapper pwsh "$(find_versioned_tool_path)"
}

function test_tool () {
  pwsh -version
}
