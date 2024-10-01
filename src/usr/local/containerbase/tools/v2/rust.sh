#!/bin/bash

export NEEDS_PREPARE=1

function prepare_tool() {
  local cargo_home

  init_tool

  cargo_home=$(get_cache_path)/.cargo
  ln -sf "${cargo_home}" "${USER_HOME}/.cargo"
}

function init_tool () {
   local cargo_home

  cargo_home=$(get_cache_path)/.cargo

  if [ -d "${cargo_home}" ]; then
    # already initialized
    return
  fi

  create_folder "${cargo_home}" 775
  chown -R "${USER_ID}" "${cargo_home}"
}

function install_tool () {
  local versioned_tool_path
  local file
  local arch
  local base_url
  local checksum_file
  local expected_checksum
  local ext=gz
  local file_name

  arch=$(uname -p)
  file_name="rust-${TOOL_VERSION}-${arch}-unknown-linux-gnu.tar"
  base_url="https://static.rust-lang.org/dist/${file_name}"

  # not all releases have checksums
  if [[ $(file_exists "${base_url}.xz.sha256") == "200" ]]; then
    checksum_file=$(get_from_url "${base_url}.xz.sha256")
    # get checksum from file
    expected_checksum=$(cut -d' ' -f1  "${checksum_file}")
    ext=xz
  else
    checksum_file=$(get_from_url "${base_url}.gz.sha256")
    # get checksum from file
    expected_checksum=$(cut -d' ' -f1  "${checksum_file}")
  fi

  file=$(get_from_url "${base_url}.${ext}" "${file_name}.${ext}" "${expected_checksum}" "sha256sum")
  mkdir -p "${TEMP_DIR}/rust"
  bsdtar --strip 1 -C "${TEMP_DIR}/rust" -xf "${file}"
  versioned_tool_path=$(create_versioned_tool_path)
  "${TEMP_DIR}/rust/install.sh" --prefix="$versioned_tool_path" --components=cargo,rust-std-"${arch}"-unknown-linux-gnu,rustc
  rm -rf "${TEMP_DIR}/rust"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "cargo" "${versioned_tool_path}/bin"
  shell_wrapper "rustc" "${versioned_tool_path}/bin"

  [[ -n $SKIP_VERSION ]] || cargo --version
  [[ -n $SKIP_VERSION ]] || rustc --version
}
