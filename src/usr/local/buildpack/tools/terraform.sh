#!/bin/bash

set -e

check_semver ${TERRAFORM_VERSION}

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TERRAFORM_VERSION}
  exit 1
fi

if [[ -d "/usr/local/bin/${TOOL_NAME}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

DISTRO=linux_amd64
URL=https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_${DISTRO}.zip

curl -sL $URL -o tmp.zip
unzip -q -d /usr/local/bin/ tmp.zip
rm tmp.zip

terraform version
