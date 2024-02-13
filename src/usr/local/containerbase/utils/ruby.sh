#!/bin/bash

function check_tool_requirements () {
  check_command ruby
  check_semver "$TOOL_VERSION" "all"
}

function find_gem_versioned_path() {
  local ruby_version
  local tool_dir
  ruby_version=$(get_tool_version ruby)
  tool_dir="$(find_versioned_tool_path)/${ruby_version}"

  if [[ -d "${tool_dir}" ]]; then
    echo "${tool_dir}"
  fi
}

function check_tool_installed() {
  test -n "$(find_gem_versioned_path)"
}

function install_tool() {
  # always install with user umask
  # shellcheck disable=SC2034
  local ROOT_UMASK=${USER_UMASK}
  local ruby_version
  local tool_path
  ruby_version=$(get_tool_version ruby)
  tool_path="$(create_versioned_tool_path)/${ruby_version}"
  mkdir -p "${tool_path}"

  if [[ $(restore_folder_from_cache "${tool_path}" "${TOOL_NAME}/${TOOL_VERSION}/${ruby_version}") -ne 0 ]]; then
    # restore from cache not possible
    # either not in cache or error, install

    gem install --install-dir "${tool_path}" --bindir "${tool_path}/bin" "${TOOL_NAME}" -v "${TOOL_VERSION}" # --silent

    # TODO: clear gem cache

    # store in cache
    cache_folder "${tool_path}" "${TOOL_NAME}/${TOOL_VERSION}/${ruby_version}"
  fi
}

function post_install () {
  local tool_path

  tool_path=$(find_gem_versioned_path)

  while IFS= read -r -d '' tool
  do
    [ -e "${tool_path}/bin/$tool" ] || continue
    shell_wrapper "$tool" "${tool_path}/bin" "GEM_PATH=\$GEM_PATH:${tool_path}"
  done < <(find "${tool_path}/bin" -type f -printf "%f\0")
}
