#!/bin/bash

if [[ -f "/usr/local/etc/env" && -z "${CONTAINERBASE_ENV+x}" ]]; then
    # shellcheck source=/dev/null
  . /usr/local/etc/env
fi

if [[ -n "${CONTAINERBASE_CLEANUP_PATH}" ]]; then
  # cleanup path via https://www.npmjs.com/package/del
  containerbase-cli cleanup path "${CONTAINERBASE_CLEANUP_PATH}"
fi

tmp_dir="${CONTAINERBASE_TMP_DIR:-/tmp/containerbase}"
if [[ "${tmp_dir}" != "/tmp/containerbase" && ! -e "/tmp/containerbase" && ! -L "/tmp/containerbase" ]]; then
  # the home symlinks point to the default path, so link it to the configured one
  ln -s "${tmp_dir}" /tmp/containerbase
fi

if [[ ! -d "${tmp_dir}" ]]; then
  # initialize all prepared tools
  containerbase-cli init tool all
fi

exec dumb-init -- "$@"
