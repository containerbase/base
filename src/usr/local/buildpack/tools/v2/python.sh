#!/bin/bash

# sets the correct shebang for python
fix_python_shebangs() {
  # https://github.com/koalaman/shellcheck/wiki/SC2044
  while IFS= read -r -d '' file
  do
    case "$(head -1 "${file}")" in
    "#!"*"/bin/python" )
      sed -i "1 s:.*:#\!${versioned_tool_path}\/bin\/python:" "${file}"
      ;;
    "#!"*"/bin/python${MAJOR}" )
      sed -i "1 s:.*:#\!${versioned_tool_path}\/bin\/python${MAJOR}:" "${file}"
      ;;
    "#!"*"/bin/python${MAJOR}.${MINOR}" )
      sed -i "1 s:.*:#\!${versioned_tool_path}\/bin\/python${MAJOR}.${MINOR}:" "${file}"
      ;;
    esac
  done < <(find "${versioned_tool_path}/bin" -type f -exec grep -Iq . {} \; -print0)
}

function prepare_tool() {
  apt_install \
    build-essential \
    libbz2-dev \
    libffi-dev \
    liblzma-dev \
    libreadline-dev \
    libsqlite3-dev \
    libssl-dev \
    zlib1g-dev \
    ;
  if [[ ! -x "$(command -v python-build)" ]]; then
    git clone https://github.com/pyenv/pyenv.git
    pushd pyenv/plugins/python-build || exit
    ./install.sh
    popd || exit
    rm -rf pyenv
  fi
}

function install_tool () {
  local versioned_tool_path
  local file
  local url
  local arch
  local version_codename

  # get semver -> major, minor, patch
  check_semver "${TOOL_VERSION}"

  versioned_tool_path=$(create_versioned_tool_path)
  arch=$(uname -p)
  url="https://github.com/containerbase/python-prebuild/releases/download"
  version_codename=$(get_distro)

  create_folder "${versioned_tool_path}/bin"

  file=$(get_from_url "${url}/${TOOL_VERSION}/python-${TOOL_VERSION}-${version_codename}-${arch}.tar.xz")

  if [[ -f ${file} ]]; then
    echo 'Using prebuild python'
    tar -C "${versioned_tool_path}" --strip 1 -xf "${file}"
  else
    python-build "$TOOL_VERSION" "${versioned_tool_path}/${TOOL_VERSION}"
  fi

  fix_python_shebangs

  # install latest pip
  PYTHONHOME=${versioned_tool_path} "${versioned_tool_path}/bin/pip" install --upgrade pip

  # clean cache https://pip.pypa.io/en/stable/reference/pip_cache/#pip-cache
  PYTHONHOME=${versioned_tool_path} "${versioned_tool_path}/bin/pip" cache purge
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  # get semver -> major, minor, patch
  check_semver "${TOOL_VERSION}"

  reset_tool_env

  # export python vars
  export_tool_env PYTHONHOME "${versioned_tool_path}"
  export_tool_path "${versioned_tool_path}/bin"
  export_tool_path "${USER_HOME}/.local/bin"

  # TODO: fix me, currently required for global pip
  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  shell_wrapper "${TOOL_NAME}${MAJOR}" "${versioned_tool_path}/bin"
  shell_wrapper "${TOOL_NAME}${MAJOR}.${MINOR}" "${versioned_tool_path}/bin"
  shell_wrapper pip "${versioned_tool_path}/bin"
  shell_wrapper "pip${MAJOR}" "${versioned_tool_path}/bin"
  shell_wrapper "pip${MAJOR}.${MINOR}" "${versioned_tool_path}/bin"

  python --version
  pip --version
}
