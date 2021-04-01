#!/bin/bash

set -e

require_root
check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

if [[ -d "/usr/local/go/${TOOL_VERSION}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

# fix version
GOLANG_FILE_VERSION=${TOOL_VERSION}
if [[ "${PATCH}" == "0" ]]; then
  GOLANG_FILE_VERSION="${MAJOR}.${MINOR}"
fi

# go suggests: git svn bzr mercurial
apt_install bzr mercurial

mkdir -p /usr/local/go/${TOOL_VERSION}
curl -sSL https://dl.google.com/go/go${GOLANG_FILE_VERSION}.linux-amd64.tar.gz --output go.tgz
tar --strip 1 -C /usr/local/go/${TOOL_VERSION} -xzf go.tgz
rm go.tgz

export_env GOPATH "/go"
export_env CGO_ENABLED 0
export_env GOSUMDB off
export_path "/usr/local/go/${TOOL_VERSION}/bin:\$GOPATH/bin"

mkdir -p "$GOPATH/src" "$GOPATH/bin" "$GOPATH/pkg"

chown -R ${USER_ID} $GOPATH
chmod -R g+w $GOPATH

go version
go env

shell_wrapper go
