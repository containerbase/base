#!/bin/bash

function prepare_tool() {
  groupadd -g 999 docker
  usermod -aG docker "${USER_NAME}"
  create_tool_path > /dev/null
}

function install_tool () {
  local versioned_tool_path
  local file
  local arch

  if [[ ! -d "$(find_tool_path)" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
  fi

  arch=$(uname -p)
  file=$(get_from_url "https://download.docker.com/linux/static/stable/${arch}/docker-${TOOL_VERSION}.tgz")

  versioned_tool_path=$(create_versioned_tool_path)
  mkdir "${versioned_tool_path}/bin"
  bsdtar -C "${versioned_tool_path}/bin" --strip 1 -xf "${file}" docker/docker
}

function link_tool () {
  shell_wrapper "${TOOL_NAME}" "$(find_versioned_tool_path)/bin"
  [[ -n $SKIP_VERSION ]] || docker --version
}
