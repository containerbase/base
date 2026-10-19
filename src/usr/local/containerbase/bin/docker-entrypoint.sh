#!/bin/bash

if [[ -f "/usr/local/etc/env" && -z "${CONTAINERBASE_ENV+x}" ]]; then
    # shellcheck source=/dev/null
  . /usr/local/etc/env
fi

if [[ -n "${CONTAINERBASE_CLEANUP_PATH}" ]]; then
  # cleanup path via https://www.npmjs.com/package/del
  containerbase-cli cleanup path "${CONTAINERBASE_CLEANUP_PATH}"
fi

# trailing slashes are dropped, a relative path, `/` or a folder inside the default one is ignored
tmp_dir="${CONTAINERBASE_TMP_DIR%"${CONTAINERBASE_TMP_DIR##*[!/]}"}"
if [[ "${tmp_dir}" != /* || "${tmp_dir}" == /tmp/containerbase/* ]]; then
  if [[ -n "${CONTAINERBASE_TMP_DIR}" ]]; then
    echo "Ignoring invalid CONTAINERBASE_TMP_DIR=${CONTAINERBASE_TMP_DIR}, using /tmp/containerbase" >&2
  fi
  tmp_dir=/tmp/containerbase
fi

init_check=/tmp/containerbase
if [[ "${tmp_dir}" != "/tmp/containerbase" ]]; then
  # the home symlinks point to the default path, so link it to the configured one,
  # replace a link to another target and keep an existing folder
  if [[ -L "/tmp/containerbase" ]]; then
    if [[ "$(readlink /tmp/containerbase)" != "${tmp_dir}" ]]; then
      ln -sfn "${tmp_dir}" /tmp/containerbase
    fi
  elif [[ ! -e "/tmp/containerbase" ]]; then
    ln -s "${tmp_dir}" /tmp/containerbase
  fi
  # init creates `tool.init.d`, so an empty mounted folder still gets initialized
  init_check="${tmp_dir}/tool.init.d"
fi

if [[ ! -d "${init_check}" ]]; then
  # initialize all prepared tools
  containerbase-cli init tool all
fi

exec dumb-init -- "$@"
