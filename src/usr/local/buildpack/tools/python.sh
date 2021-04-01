#!/bin/bash

set -e

check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

tool_path=$(find_tool_path)

function update_env () {
  reset_tool_env
  export_tool_path "\$HOME/.local/bin:${1}/bin"
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${base_path}

  file=/tmp/python.tar.xz

  ARCH=$(uname -p)
  CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})
  PYTHON_URL="https://github.com/containerbase/python-prebuild/releases/download"

  curl -sSfLo ${file} ${PYTHON_URL}/${TOOL_VERSION}/python-${TOOL_VERSION}-${CODENAME}-${ARCH}.tar.xz || echo 'Ignore download error'

  if [[ -f ${file} ]]; then
    echo 'Using prebuild python'
    tar -C ${base_path} -xf ${file}
    rm ${file}
  else
    echo 'No prebuild python found, building from source'
    require_root
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
      pushd pyenv/plugins/python-build
      ./install.sh
      popd
      rm -rf pyenv
    fi
    python-build $TOOL_VERSION ${base_path}/$TOOL_VERSION
  fi

  update_env ${tool_path}

  fix_python_shebangs() {
    for file in $(find ${tool_path}/bin -type f -exec grep -Iq . {} \; -print); do
      case "$(head -1 "${file}")" in
      "#!"*"/bin/python" )
        sed -i "1 s:.*:#\!${tool_path}\/bin\/python:" "${file}"
        ;;
      "#!"*"/bin/python${MAJOR}" )
        sed -i "1 s:.*:#\!${tool_path}\/bin\/python${MAJOR}:" "${file}"
        ;;
      "#!"*"/bin/python${MAJOR}.${MINOR}" )
        sed -i "1 s:.*:#\!${tool_path}\/bin\/python${MAJOR}.${MINOR}:" "${file}"
        ;;
      esac
    done
  }

  fix_python_shebangs

  pip install --upgrade pip

  # clean cache https://pip.pypa.io/en/stable/reference/pip_cache/#pip-cache
  pip cache purge
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

python --version

if [[ $EUID -eq 0 ]]; then
  shell_wrapper python
fi
