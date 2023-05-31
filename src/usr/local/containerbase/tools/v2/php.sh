#!/bin/bash

function prepare_tool() {
  local version_codename
  local tool_path

  version_codename="$(get_distro)"
  case "$version_codename" in
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
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'focal' or 'jammy'." >&2
      exit 1
    ;;
  esac
  tool_path=$(create_tool_path)
}

function install_tool () {
  local tool_path
  local file
  local base_url
  local arch=${ARCHITECTURE}
  local name=${TOOL_NAME}
  local version=${TOOL_VERSION}
  local version_codename
  local checksum_file
  local expected_checksum
  local checksum_exists

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${name} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  base_url="https://github.com/containerbase/${name}-prebuild/releases/download"
  version_codename=$(get_distro)

  # not all releases have checksums
  checksum_exists=$(file_exists "${base_url}/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz.sha512")
  if [[ "${checksum_exists}" == "200" ]]; then
    checksum_file=$(get_from_url "${base_url}/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz.sha512")
    # get checksum from file
    expected_checksum=$(cat "${checksum_file}")
  fi

  # download file
  file=$(get_from_url \
    "${base_url}/${version}/${name}-${version}-${version_codename}-${arch}.tar.xz" \
    "${name}-${version}-${version_codename}-${arch}.tar.xz" \
    "${expected_checksum}" \
    sha512sum
    )

  if [[ -z "$file" ]]; then
    echo "Download failed" >&2
    exit 1;
  fi

  tar -C "${tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper php "${versioned_tool_path}/bin"
  [[ -n $SKIP_VERSION ]] || php --version
}
