#!/bin/bash


function prepare_tool() {
  local go_path

  # go suggests: git svn bzr mercurial
  apt_install bzr mercurial

  go_path=$(get_home_path)/go

  export_env GOPATH "${go_path}" true
  export_path "\$GOPATH/bin"

  mkdir -p "${go_path}/src" "${go_path}/bin" "${go_path}/pkg"

  chown -R "${USER_ID}" "${go_path}"
  chmod -R g+w "${go_path}"
  create_tool_path > /dev/null
}

function install_tool () {
  local versioned_tool_path
  local file
  local arch=linux-amd64
  local GOLANG_FILE_VERSION

  if [[ ! -d "$(find_tool_path)" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
  fi

  # fix version, only for go 1.20 and below
  GOLANG_FILE_VERSION=${TOOL_VERSION}
  if [[ ($MAJOR -lt 1 || ($MAJOR -eq 1 && $MINOR -lt 21)) && "${PATCH}" == "0" ]]; then
    GOLANG_FILE_VERSION="${MAJOR}.${MINOR}"
  fi

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux-arm64
  fi

  file=$(get_from_url "https://dl.google.com/go/go${GOLANG_FILE_VERSION}.${arch}.tar.gz")

  versioned_tool_path=$(create_versioned_tool_path)
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper go "${versioned_tool_path}/bin"

  go version
  go env
}
