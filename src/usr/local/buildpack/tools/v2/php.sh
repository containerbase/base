#!/bin/bash

function prepare_tool() {
  local version_codename
  local tool_path

  version_codename="$(get_distro)"
  case "$version_codename" in
    "bionic") apt_install \
      libjpeg-turbo8 \
      libmcrypt4 \
      libonig4 \
      libpng16-16 \
      libtidy5 \
      libxslt1.1 \
      libzip4 \
      ;;
    "focal") apt_install \
      libjpeg-turbo8 \
      libmcrypt4 \
      libonig5 \
      libpng16-16 \
      libtidy5deb1 \
      libxslt1.1 \
      libzip5 \
      ;;
    "jammy") apt_install \
      libjpeg-turbo8 \
      libmcrypt4 \
      libonig5 \
      libpng16-16 \
      libtidy5deb1 \
      libxslt1.1 \
      libzip4 \
      ;;
    *)
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'bionic', 'focal' or 'jammy'." >&2
      exit 1
    ;;
  esac
  tool_path=$(create_tool_path)
}

function install_tool () {
  local tool_path
  local file
  local BASE_URL
  local ARCH
  local version_codename

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  ARCH=$(uname -p)
  BASE_URL="https://github.com/containerbase/${TOOL_NAME}-prebuild/releases/download"
  version_codename=$(get_distro)

  file=$(get_from_url "${BASE_URL}/${TOOL_VERSION}/${TOOL_NAME}-${TOOL_VERSION}-${version_codename}-${ARCH}.tar.xz")
  tar -C "${tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper php "${versioned_tool_path}/bin"
  php --version
}
