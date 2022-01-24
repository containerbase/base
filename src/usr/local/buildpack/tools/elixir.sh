#!/bin/bash

set -e

require_root
check_command erl


base_path=/usr/local/buildpack/${TOOL_NAME}
tool_path=${base_path}/${TOOL_VERSION}

if [[ ! -d "$tool_path" ]]; then
  curl -sSL "https://github.com/elixir-lang/elixir/releases/download/v${TOOL_VERSION}/Precompiled.zip" -o elixir.zip
  mkdir -p "$tool_path"
  unzip -q elixir.zip -d "$tool_path"
  rm elixir.zip
fi

link_wrapper "${TOOL_NAME}" "${tool_path}/bin"
link_wrapper mix "${tool_path}/bin"

elixir --version
mix --version

su -c 'mix local.hex --force' "${USER_NAME}"
su -c 'mix local.rebar --force' "${USER_NAME}"
