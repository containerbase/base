#!/bin/bash

set -e

check_semver "${TOOL_VERSION}"


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: "${TOOL_VERSION}"
  exit 1
fi

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p "${base_path}"

  file=/tmp/python.tar.xz

  ARCH=$(uname -p)
  PYTHON_URL="https://github.com/containerbase/python-prebuild/releases/download"

  version_codename=$(get_distro)

  curl -sSfLo ${file} "${PYTHON_URL}/${TOOL_VERSION}/python-${TOOL_VERSION}-${version_codename}-${ARCH}.tar.xz" || echo 'Ignore download error'

  if [[ -f ${file} ]]; then
    echo 'Using prebuild python'
    tar -C "${base_path}" -xf ${file}
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
    python-build "$TOOL_VERSION" "${base_path}"/"$TOOL_VERSION"
  fi

  fix_python_shebangs() {
    # https://github.com/koalaman/shellcheck/wiki/SC2044
    while IFS= read -r -d '' file
    do
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
    done < <(find "${tool_path}/bin" -type f -exec grep -Iq . {} \; -print0)
  }

  fix_python_shebangs

  PYTHONHOME=${tool_path} "${tool_path}/bin/pip" install --upgrade pip

  # clean cache https://pip.pypa.io/en/stable/reference/pip_cache/#pip-cache
  PYTHONHOME=${tool_path} "${tool_path}/bin/pip" cache purge
fi

reset_tool_env
# TODO: fix me, currently required for global pip
export_tool_path "${tool_path}/bin"
export_tool_path "${USER_HOME}/.local/bin"

function python_shell_wrapper () {
  local install_dir
  local FILE
  install_dir=$(get_install_dir)
  FILE="${install_dir}/bin/${1}"
  check_command "${tool_path}/bin/$1"
  cat > "$FILE" <<- EOM
#!/bin/bash

export PYTHONHOME=${tool_path} PATH=${tool_path}/bin:\$PATH

${1} "\$@"
EOM
  chmod 775 "$FILE"
}

python_shell_wrapper "${TOOL_NAME}"
python_shell_wrapper "${TOOL_NAME}${MAJOR}"
python_shell_wrapper "${TOOL_NAME}${MAJOR}.${MINOR}"
python_shell_wrapper pip
python_shell_wrapper "pip${MAJOR}"
python_shell_wrapper "pip${MAJOR}.${MINOR}"

python --version
pip --version
