#!/bin/bash

if [[ -f "/usr/local/etc/env" && -z "${CONTAINERBASE_ENV+x}" ]]; then
    # shellcheck source=/dev/null
  . /usr/local/etc/env
fi

if [[ -n "${CONTAINERBASE_CLEANUP_PATH}" ]]; then
  # cleanup path via https://www.npmjs.com/package/del
  containerbase-cli cleanup path "${CONTAINERBASE_CLEANUP_PATH}"
fi

CONTAINERBASE_DEFAULT_TMP_DIR=/tmp/containerbase
# shellcheck source=/dev/null
. /usr/local/containerbase/utils/tmp-dir.sh

tmp_dir=$(containerbase_tmp_dir "${CONTAINERBASE_TMP_DIR}")
init_check="${CONTAINERBASE_DEFAULT_TMP_DIR}"
if [[ "${tmp_dir}" != "${CONTAINERBASE_DEFAULT_TMP_DIR}" ]]; then
  # the home symlinks point to the default path, so link it to the configured one
  link_containerbase_tmp_path "${tmp_dir}" || exit 1
  # init creates `tool.init.d`, so an empty mounted folder still gets initialized
  init_check="${tmp_dir}/tool.init.d"
fi

if [[ ! -d "${init_check}" ]]; then
  # initialize all prepared tools
  containerbase-cli init tool all
fi

exec dumb-init -- "$@"
