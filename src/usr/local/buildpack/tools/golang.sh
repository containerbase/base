#!/bin/bash

set -e

require_root
check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi


base_path=/usr/local/buildpack/go
tool_path=${base_path}/${TOOL_VERSION}

if [[ ! -d "$tool_path" ]]; then

  # fix version
  GOLANG_FILE_VERSION=${TOOL_VERSION}
  if [[ "${PATCH}" == "0" ]]; then
    GOLANG_FILE_VERSION="${MAJOR}.${MINOR}"
  fi

  # go suggests: git svn bzr mercurial
  apt_install bzr mercurial

  mkdir -p $tool_path
  curl -sSL https://dl.google.com/go/go${GOLANG_FILE_VERSION}.linux-amd64.tar.gz --output go.tgz
  tar --strip 1 -C $tool_path -xzf go.tgz
  rm go.tgz

  if [[ ! -d "${GOPATH}" ]]; then
    export_env GOPATH "/go"
    export_env CGO_ENABLED 0
    export_env GOSUMDB off
    export_path "\$GOPATH/bin"

    mkdir -p "$GOPATH/src" "$GOPATH/bin" "$GOPATH/pkg"

    chown -R ${USER_ID} $GOPATH
    chmod -R g+w $GOPATH
  fi
fi

link_wrapper go $tool_path/bin

go version
go env

