#!/bin/bash


function prepare_tool() {

  # go suggests: git svn bzr mercurial
  apt_install bzr mercurial

  export_env GOPATH "/go"
  export_env CGO_ENABLED 0
  export_env GOSUMDB off
  export_path "\$GOPATH/bin"

  mkdir -p "$GOPATH/src" "$GOPATH/bin" "$GOPATH/pkg"

  chown -R "${USER_ID}" "$GOPATH"
  chmod -R g+w "$GOPATH"
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

  versioned_tool_path=$(create_versioned_tool_path)

  # fix version
  GOLANG_FILE_VERSION=${TOOL_VERSION}
  if [[ "${PATCH}" == "0" ]]; then
    GOLANG_FILE_VERSION="${MAJOR}.${MINOR}"
  fi

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux-arm64
  fi

  file=$(get_from_url "https://dl.google.com/go/go${GOLANG_FILE_VERSION}.${arch}.tar.gz")
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper go "${versioned_tool_path}/bin"

  go version
  go env
}
