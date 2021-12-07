#!/usr/bin/env bash

set -e

require_root
check_command erl

if [[ -d "/usr/local/${TOOL_NAME}/${TOOL_VERSION}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

curl -sSL https://github.com/elixir-lang/elixir/releases/download/v${TOOL_VERSION}/Precompiled.zip -o elixir.zip
mkdir -p /usr/local/${TOOL_NAME}/${TOOL_VERSION}
unzip -q elixir.zip -d /usr/local/${TOOL_NAME}/${TOOL_VERSION}
rm elixir.zip

export_path "/usr/local/${TOOL_NAME}/${TOOL_VERSION}/bin"

elixir --version
mix --version

su -c 'mix local.hex --force' ${USER_NAME}
su -c 'mix local.rebar --force' ${USER_NAME}

shell_wrapper elixir
shell_wrapper mix
