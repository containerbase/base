#!/bin/bash

function prepare_tool() {
  local version_codename

  version_codename="$(get_distro)"
  case "${version_codename}" in
    "focal") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu66 libssl1.1 libstdc++6 zlib1g;;
    "jammy") apt_install libc6 libgcc1 libgssapi-krb5-2 libicu70 libssl3 libstdc++6 zlib1g;;
    *)
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'focal' or 'jammy'." >&2
      exit 1
    ;;
  esac

  create_tool_path > /dev/null
}

function install_tool () {
  local file
  local versioned_tool_path
  local arch=linux-x64

  if [[ ! -d "$(find_tool_path)" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
  fi

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
  pwsh -version
}
