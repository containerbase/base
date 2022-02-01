#!/bin/bash

function legacy_tool_install () {

  set -e

  require_root
  check_semver "${TOOL_VERSION}"


  if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
    echo Invalid version: "${TOOL_VERSION}"
    exit 1
  fi

  base_path=/usr/local/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  if [[ ! -d "$tool_path" ]]; then

    mkdir -p "$base_path"

    ARCH=$(uname -p)
    RUBY_URL="https://github.com/containerbase/ruby-prebuild/releases/download"

    version_codename=$(get_distro)

    curl -sSfLo ruby.tar.xz "${RUBY_URL}/${TOOL_VERSION}/ruby-${TOOL_VERSION}-${version_codename}-${ARCH}.tar.xz" || echo 'Ignore download error'

    if [[ -f ruby.tar.xz ]]; then
      echo "Using prebuild ruby for ${version_codename}"
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

      ruby-build "$TOOL_VERSION" "$tool_path"
    fi

    # System settings
    mkdir -p "$tool_path"/etc
    cat > "$tool_path"/etc/gemrc <<- EOM
gem: --bindir /usr/local/bin --no-document
:benchmark: false
:verbose: true
:update_sources: true
:backtrace: false
EOM

    if [[ ! -r "${USER_HOME}/.gemrc" ]];then
    cat > "${USER_HOME}"/.gemrc <<- EOM
gem: --bindir ${USER_HOME}/bin --no-document
EOM
      chown -R "${USER_ID}" "${USER_HOME}"/.gemrc
      chmod -R g+w "${USER_HOME}"/.gemrc
    fi

  fi

  reset_tool_env
  cat >> "$(find_tool_env)" <<- EOM
if [ "\${EUID}" != 0 ]; then
  export GEM_HOME="${USER_HOME}/.gem/ruby/${MAJOR}.${MINOR}.0"
fi
EOM

  link_wrapper ruby "$tool_path/bin"
  link_wrapper gem "$tool_path/bin"

  echo "$TOOL_VERSION" > "$base_path"/.version

  ruby --version
  echo "gem $(gem --version)"

  gem env
}

