#!/bin/bash

set -e

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

  mkdir -p "${base_path}"

  file=/tmp/php.tar.xz

  ARCH=$(uname -p)
  BASE_URL="https://github.com/containerbase/php-prebuild/releases/download"

  version_codename=$(get_distro)

   # TODO: extract to separate preparation tool
  require_root
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
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use 'ubuntu' or 'bionic'." >&2
      exit 1
    ;;
  esac

  curl -sSfLo ${file} "${BASE_URL}/${TOOL_VERSION}/php-${TOOL_VERSION}-${version_codename}-${ARCH}.tar.xz"

  if [[ -f ${file} ]]; then
    echo 'Using prebuild php'
    tar -C "${base_path}" -xf ${file}
    rm ${file}
  else
    echo 'No prebuild php found' >&2
    exit 1
  fi
fi

link_wrapper "${TOOL_NAME}" "${tool_path}/bin"

php --version
