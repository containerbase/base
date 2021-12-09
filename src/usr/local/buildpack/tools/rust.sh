#!/bin/bash

set -e

require_root
check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

base_path=/usr/local/buildpack/${TOOL_NAME}
tool_path=$base_path/$TOOL_VERSION

if [[ ! -d "${tool_path}" ]]; then

  if [[ ! -d $base_path ]]; then
    mkdir -p $base_path
    export_env RUST_BACKTRACE 1
    export_env CARGO_HOME "${USER_HOME}/.cargo"
    export_path "\$CARGO_HOME/bin:"
  fi

  curl -sSfLo rust.tar.gz https://static.rust-lang.org/dist/rust-${TOOL_VERSION}-x86_64-unknown-linux-gnu.tar.gz
  mkdir rust
  pushd rust
  tar --strip 1 -xf ../rust.tar.gz
  ./install.sh --prefix=$tool_path --components=cargo,rust-std-x86_64-unknown-linux-gnu,rustc
  popd
  rm rust.tar.gz
rm -rf rust
fi

link_wrapper rustc ${tool_path}/bin
link_wrapper cargo ${tool_path}/bin

cargo --version
rustc --version
