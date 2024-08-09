#!/usr/bin/env bash

function install_tool() {
  local versioned_tool_path
  local file
  local arch
  local build_path
  local name=${TOOL_NAME}
  local tool_path
  local version=${TOOL_VERSION}

  # if [[ ${MAJOR} -lt 2 || (${MAJOR} -eq 2 && ${MINOR} -lt 14) ]]; then
  #   echo "Nix version ${TOOL_VERSION} is not supported! Use v2.14 or higher." >&2
  #   exit 1
  # fi

  arch=$(uname -m)
  base_url="https://github.com/containerbase/${name}-prebuild/releases/download"

  # not all releases have checksums
  checksum_exists=$(file_exists "${base_url}/${version}/${name}-${version}-${arch}.tar.xz.sha512")
  if [[ "${checksum_exists}" == "200" ]]; then
    echo "Downloading ${name} ${version} for ${arch} from github ..."
    tool_path=$(create_tool_path)
    checksum_file=$(get_from_url "${base_url}/${version}/${name}-${version}-${arch}.tar.xz.sha512")
    # get checksum from file
    expected_checksum=$(cat "${checksum_file}")
    file=$(get_from_url \
      "${base_url}/${version}/${name}-${version}-${arch}.tar.xz" \
      "${name}-${version}-${arch}.tar.xz" \
      "${expected_checksum}" \
      sha512sum
    )

    bsdtar -C "${tool_path}" -xf "${file}"
  else
    TOOL_VERSION="${MAJOR}.${MINOR}"
    echo "Downloading ${name} ${version} for ${arch} from hydra ..."
    if [[ ${MAJOR} -lt 2 || (${MAJOR} -eq 2 && ${MINOR} -lt 24) ]]; then
      build_path="buildStatic.${arch}-linux"
    else
      build_path="buildStatic.nix.${arch}-linux"
    fi

    file=$(get_from_url "https://hydra.nixos.org/job/nix/maintenance-${TOOL_VERSION}/${build_path}/latest/download-by-type/file/binary-dist")

    versioned_tool_path=$(create_versioned_tool_path)
    create_folder "${versioned_tool_path}/bin"
    cp "${file}" "${versioned_tool_path}/bin/nix"
    chmod +x "${versioned_tool_path}/bin/nix"
  fi
}

function link_tool() {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin" "NIX_STORE_DIR=$(get_home_path)/nix/store NIX_DATA_DIR=$(get_home_path)/nix/data NIX_LOG_DIR=$(get_cache_path)/nix/log NIX_STATE_DIR=$(get_home_path)/nix/state NIX_CONF_DIR=$(get_home_path)/nix/conf"
  [[ -n $SKIP_VERSION ]] || nix --version
}
