#!/bin/bash

function check_tool_requirements () {
  check_command ruby
  check_semver "$TOOL_VERSION" "all"
}

function get_ruby_minor_version() {
  local ruby_version=$1
  if [[ ! "${ruby_version}" =~ ${SEMVER_REGEX} ]]; then
    echo Ruby is not a semver like version - aborting: "${ruby_version}"
    exit 1
  fi
  echo "${BASH_REMATCH[1]}.${BASH_REMATCH[3]}.0"
}

function find_gem_versioned_path() {
  local ruby_version
  local tool_dir
  ruby_version=$(get_tool_version ruby)
  tool_dir="$(find_versioned_tool_path)/$(get_ruby_minor_version "${ruby_version}")"

  if [[ -d "${tool_dir}" ]]; then
    echo "${tool_dir}"
  fi
}

function check_tool_installed() {
  test -n "$(find_gem_versioned_path)"
}

function install_tool() {
  local ruby_version
  local tool_path
  ruby_version=$(get_tool_version ruby)
  tool_path="$(create_versioned_tool_path)/$(get_ruby_minor_version "${ruby_version}")"
  mkdir -p "${tool_path}"
  gem install --install-dir "${tool_path}" --bindir "${tool_path}/bin" "${TOOL_NAME}" -v "${TOOL_VERSION}" --silent

  # TODO: clear gem cache
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
