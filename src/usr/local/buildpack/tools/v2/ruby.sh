#!/bin/bash

function ruby_shell_wrapper () {
  local TARGET
  local versioned_tool_path=$2
  local SOURCE
  TARGET="$(get_bin_path)/${1}"
  SOURCE=${versioned_tool_path}/bin/${1}
  check SOURCE true
  check_command "$SOURCE"

  cat > "$TARGET" <<- EOM
#!/bin/bash

if [[ -r "$ENV_FILE" && -z "${BUILDPACK+x}" ]]; then
  . $ENV_FILE
fi
if [ "\${EUID}" != 0 ]; then
  export GEM_HOME="${USER_HOME}/.gem/ruby/${MAJOR}.${MINOR}.0"
fi

${SOURCE} "\$@"
EOM
  # make it writable for the owner and the group
  if [[ -O "$TARGET" ]] && [ "$(stat --format '%a' "${TARGET}")" -ne 775 ] ; then
    # make it writable for the owner and the group only if we are the owner
    chmod 775 "$TARGET"
  fi
}

function prepare_tool() {
  local version_codename
  local tool_path

  version_codename="$(get_distro)"
  case "${version_codename}" in
    "bionic");;
    "focal");;
    "jammy");;
    *)
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'bionic', 'focal' or 'jammy'." >&2
      exit 1
    ;;
  esac
  apt_install \
    build-essential \
    libffi-dev \
    ;
  tool_path=$(create_tool_path)

  cat > "${USER_HOME}"/.gemrc <<- EOM
gem: --bindir ${USER_HOME}/bin --no-document
EOM
  chown -R "${USER_ID}" "${USER_HOME}"/.gemrc
  chmod -R g+w "${USER_HOME}"/.gemrc

  # Workaround for compatibillity for Ruby hardcoded paths
  if [ "${tool_path}" != "${ROOT_DIR_LEGACY}/ruby" ]; then
    ln -sf "${tool_path}" /usr/local/ruby
  fi
}

function install_tool () {
  local tool_path
  local file
  local BASE_URL
  local ARCH
  local version_codename
  local versioned_tool_path

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  ARCH=$(uname -p)
  BASE_URL="https://github.com/containerbase/${TOOL_NAME}-prebuild/releases/download"
  version_codename=$(get_distro)

  file=$(get_from_url "${BASE_URL}/${TOOL_VERSION}/${TOOL_NAME}-${TOOL_VERSION}-${version_codename}-${ARCH}.tar.xz")
  tar -C "${tool_path}" -xf "${file}"

  versioned_tool_path=$(find_versioned_tool_path)
  # System settings
  mkdir -p "$versioned_tool_path"/etc
  cat > "$versioned_tool_path"/etc/gemrc <<- EOM
gem: --bindir /usr/local/bin --no-document
:benchmark: false
:verbose: true
:update_sources: true
:backtrace: false
EOM

}

function link_tool () {
  local tool_path
  local versioned_tool_path
  tool_path=$(find_tool_path)
  versioned_tool_path=$(find_versioned_tool_path)

  ruby_shell_wrapper ruby "${versioned_tool_path}"
  ruby_shell_wrapper gem "${versioned_tool_path}"

  echo "$TOOL_VERSION" > "${tool_path}"/.version

  ruby --version
  echo "gem $(gem --version)"
  gem env
}
