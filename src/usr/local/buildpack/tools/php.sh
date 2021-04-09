#!/usr/bin/env bash

set -e

check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

tool_path=$(find_tool_path)

function update_env () {
  reset_tool_env
  export_tool_path "${1}/bin"
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${base_path}

  file=/tmp/php.tar.xz

  ARCH=$(uname -p)
  CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})
  BASE_URL="https://github.com/containerbase/php-prebuild/releases/download"

   # TODO: extract to separate preparation tool
  require_root
  case "$CODENAME" in
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
  esac

  curl -sSfLo ${file} ${BASE_URL}/${TOOL_VERSION}/php-${TOOL_VERSION}-${CODENAME}-${ARCH}.tar.xz

  if [[ -f ${file} ]]; then
    echo 'Using prebuild php'
    tar -C ${base_path} -xf ${file}
    rm ${file}
  else
    echo 'No prebuild php found' >&2
    exit 1
  fi

  update_env ${tool_path}
  shell_wrapper php
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

php --version
