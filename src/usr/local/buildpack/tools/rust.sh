#!/bin/bash

set -e

require_root
check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

if [[ -d "/usr/local/rust/${TOOL_VERSION}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

mkdir -p /usr/local/rust

curl -sSfLo rust.tar.gz https://static.rust-lang.org/dist/rust-${TOOL_VERSION}-x86_64-unknown-linux-gnu.tar.gz
mkdir rust
pushd rust
tar --strip 1 -xf ../rust.tar.gz
./install.sh --prefix=/usr/local/rust/${TOOL_VERSION} --components=cargo,rust-std-x86_64-unknown-linux-gnu,rustc
popd
rm rust.tar.gz
rm -rf rust

export_env RUST_BACKTRACE 1
export_env CARGO_HOME "/home/ubuntu/.cargo"
export_path "\$CARGO_HOME/bin:/usr/local/rust/${TOOL_VERSION}/bin"

cargo --version
rustc --version

shell_wrapper cargo
shell_wrapper rustc
