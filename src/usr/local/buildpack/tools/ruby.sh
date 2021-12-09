#!/bin/bash

set -e

require_root
check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

base_path=/usr/local/${TOOL_NAME}
tool_path=${base_path}/${TOOL_VERSION}

if [[ -d "$tool_path" ]]; then
  echo "Skipping, already installed"
  link_wrapper ${TOOL_NAME} ${tool_path}/bin
  exit 0
fi

mkdir -p $base_path

ARCH=$(uname -p)
CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})
RUBY_URL="https://github.com/containerbase/ruby-prebuild/releases/download"

curl -sSfLo ruby.tar.xz ${RUBY_URL}/${TOOL_VERSION}/ruby-${TOOL_VERSION}-${CODENAME}-${ARCH}.tar.xz || echo 'Ignore download error'

if [[ -f ruby.tar.xz ]]; then
  echo "Using prebuild ruby for ${CODENAME}"
  apt_install \
    build-essential \
    libffi-dev \
    ;
  tar -C /usr/local/ruby -xf ruby.tar.xz
  rm ruby.tar.xz
else
  echo 'No prebuild ruby found, building from source'
  apt_install \
    build-essential \
    libreadline-dev \
    libssl-dev \
    zlib1g-dev \
    libffi-dev \
    ;

  if [[ ! -x "$(command -v ruby-build)" ]]; then
    git clone https://github.com/rbenv/ruby-build.git
    PREFIX=/usr/local ./ruby-build/install.sh
    rm -rf ruby-build
  fi

  ruby-build $TOOL_VERSION $tool_path
fi

export_env GEM_HOME "${USER_HOME}/.gem-global"
export_path "\$GEM_HOME/bin:\$HOME/.gem/ruby/${MAJOR}.${MINOR}.0/bin"

# System settings
mkdir -p $tool_path/etc
cat > $tool_path/etc/gemrc <<- EOM
gem: --no-document
:benchmark: false
:verbose: true
:update_sources: true
:backtrace: false
EOM

link_wrapper ruby $tool_path/bin
link_wrapper gem $tool_path/bin


ruby --version
echo "gem $(gem --version)"

gem env
