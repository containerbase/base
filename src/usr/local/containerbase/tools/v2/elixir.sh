#!/bin/bash
export NEEDS_PREPARE=1

function prepare_tool() {
  local path
  init_tool

  # Redirect mix home
  path="$(get_cache_path)/.hex"
  ln -sf "${path}" "${USER_HOME}/.hex"

  # Redirect mix home
  path="$(get_cache_path)/.mix"
  ln -sf "${path}" "${USER_HOME}/.mix"
}

function init_tool () {
  local path
  path="$(get_cache_path)/.mix"

  if [ -d "${path}" ]; then
    return
  fi

  # Init mix home
  create_folder "${path}" 775
  chown -R "${USER_ID}" "${path}"

  # Init hex home
  path="$(get_cache_path)/.hex"
  create_folder "${path}" 775
  chown -R "${USER_ID}" "${path}"
}

function install_tool () {
  local versioned_tool_path
  local file
  local base_url="https://github.com/elixir-lang/elixir/releases/download"
  local base_file="Precompiled.zip"

  check_command erl

  # https://github.com/elixir-lang/elixir/releases/tag/v1.14.0
  # https://hexdocs.pm/elixir/compatibility-and-deprecations.html#between-elixir-and-erlang-otp
  if [ "$MAJOR" -eq 1 ] && [ "$MINOR" -ge 17 ]; then
    base_file=elixir-otp-25.zip
  elif [ "$MAJOR" -eq 1 ] && [ "$MINOR" -ge 15 ]; then
    base_file=elixir-otp-24.zip
  elif [ "$MAJOR" -eq 1 ] && [ "$MINOR" -eq 14 ]; then
    base_file=elixir-otp-23.zip
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

  [[ -n $SKIP_VERSION ]] || elixir --version
  [[ -n $SKIP_VERSION ]] || mix --version

  if [[ $(is_root) -eq 0 ]]; then
    su -c 'mix local.hex --force' "${USER_NAME}"
    su -c 'mix local.rebar --force' "${USER_NAME}"
  else
    mix local.hex --force
    mix local.rebar --force
  fi

  # TODO: check rights of files and folder in ~/.mix and ~/.hex
}
