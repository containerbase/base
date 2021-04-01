#!/bin/bash

set -e

require_root
check_command erl

curl -sSL https://github.com/elixir-lang/elixir/releases/download/v${TOOL_VERSION}/Precompiled.zip -o elixir.zip
mkdir -p /usr/local/elixir/
unzip elixir.zip -d /usr/local/elixir/
rm elixir.zip

export_path "/usr/local/elixir/bin"

elixir --version
mix --version

su -c 'mix local.hex --force' ${USER_NAME}
su -c 'mix local.rebar --force' ${USER_NAME}

shell_wrapper elixir
shell_wrapper mix
