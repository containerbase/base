#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local file
  local base_url="https://github.com/elixir-lang/elixir/releases/download"
  local base_file="Precompiled.zip"

  check_command erl


  # https://github.com/elixir-lang/elixir/releases/tag/v1.14.0
  if [ "$MAJOR" -eq 1 ] && [ "$MINOR" -eq 14 ]; then
    base_file=elixir-otp-23.zip
  elif [ "$MAJOR" -eq 1 ] && [ "$MINOR" -gt 14 ]; then
    base_file=elixir-otp-24.zip
  fi

  file=$(get_from_url "${base_url}/v${TOOL_VERSION}/${base_file}")

  versioned_tool_path=$(create_versioned_tool_path)
  bsdtar -C "${versioned_tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  shell_wrapper mix "${versioned_tool_path}/bin"

  $SKIP_VERSION || elixir --version
  $SKIP_VERSION || mix --version

  if [[ $(is_root) -eq 0 ]]; then
    su -c 'mix local.hex --force' "${USER_NAME}"
    su -c 'mix local.rebar --force' "${USER_NAME}"
  else
    mix local.hex --force
    mix local.rebar --force
  fi
}
