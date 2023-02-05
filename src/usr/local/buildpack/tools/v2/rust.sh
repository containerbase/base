#!/bin/bash

function prepare_tool() {
  create_tool_path > /dev/null
  export_env RUST_BACKTRACE 1
  export_env CARGO_HOME "${USER_HOME}/.cargo"
  export_path "\$CARGO_HOME/bin"
}

function install_tool () {
  local versioned_tool_path
  local file
  local arch
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

  versioned_tool_path=$(create_versioned_tool_path)

  arch=$(uname -p)
  file=$(get_from_url "https://static.rust-lang.org/dist/rust-${TOOL_VERSION}-${arch}-unknown-linux-gnu.tar.gz")
  mkdir -p "${TEMP_DIR}/rust"
  bsdtar --strip 1 -C "${TEMP_DIR}/rust" -xf "${file}"
  "${TEMP_DIR}/rust/install.sh" --prefix="$versioned_tool_path" --components=cargo,rust-std-"${arch}"-unknown-linux-gnu,rustc
  rm -rf "${TEMP_DIR}/rust"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "cargo" "${versioned_tool_path}/bin"
  shell_wrapper "rustc" "${versioned_tool_path}/bin"

  cargo --version
  rustc --version
}
