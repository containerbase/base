#!/bin/bash

set -e

require_root
check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

if [[ -d "/usr/local/ruby/${TOOL_VERSION}" ]]; then
  echo "Skipping, already installed"
  exit 0
fi

mkdir -p /usr/local/ruby

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

  ruby-build $TOOL_VERSION /usr/local/ruby/${TOOL_VERSION}
fi

export_env GEM_HOME "/home/${USER_NAME}/.gem-global"
export_path "\$GEM_HOME/bin:\$HOME/.gem/ruby/${MAJOR}.${MINOR}.0/bin:/usr/local/ruby/${TOOL_VERSION}/bin"

# System settings
mkdir -p /usr/local/ruby/${TOOL_VERSION}/etc
cat > /usr/local/ruby/${TOOL_VERSION}/etc/gemrc <<- EOM
gem: --no-document
:benchmark: false
:verbose: true
:update_sources: true
:backtrace: false
EOM



ruby --version
echo "gem $(gem --version)"

gem env

shell_wrapper ruby
shell_wrapper gem
