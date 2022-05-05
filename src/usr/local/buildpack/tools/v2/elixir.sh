#!/bin/bash

function install_tool () {
  local versioned_tool_path

  check_command erl

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"

  local file
  file=$(get_from_url "https://github.com/elixir-lang/elixir/releases/download/v${TOOL_VERSION}/Precompiled.zip")
  unzip -q "${file}" -d "${versioned_tool_path}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  shell_wrapper mix "${versioned_tool_path}/bin"

  elixir --version
  mix --version

  if [[ $(is_root) -eq 0 ]]; then
    su -c 'mix local.hex --force' "${USER_NAME}"
    su -c 'mix local.rebar --force' "${USER_NAME}"
  else
    mix local.hex --force
    mix local.rebar --force
  fi
}
