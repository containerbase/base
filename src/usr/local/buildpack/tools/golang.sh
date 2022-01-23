#!/bin/bash

set -e

check_semver "${TOOL_VERSION}"


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: "${TOOL_VERSION}"
  exit 1
fi


tool_path=$(find_versioned_tool_path)

if [[ -z "$tool_path" ]]; then

  tool_path=$(create_versioned_tool_path)

  # fix version
  GOLANG_FILE_VERSION=${TOOL_VERSION}
  if [[ "${PATCH}" == "0" ]]; then
    GOLANG_FILE_VERSION="${MAJOR}.${MINOR}"
  fi

  curl -sSL "https://dl.google.com/go/go${GOLANG_FILE_VERSION}.linux-amd64.tar.gz" --output go.tgz
  tar --strip 1 -C "$tool_path" -xzf go.tgz
  rm go.tgz

  if [[ ! -d "${GOPATH}" ]]; then
    export_tool_env GOPATH "${tool_path}/go"
    export_tool_env CGO_ENABLED 0
    export_tool_env GOSUMDB off
    export_tool_path "\$GOPATH/bin"

    mkdir -p "$GOPATH/src" "$GOPATH/bin" "$GOPATH/pkg"

    chown -R "${USER_ID}" "$GOPATH"
    chmod -R g+w "$GOPATH"
  fi
fi

link_wrapper go "$tool_path/bin"

go version
go env

