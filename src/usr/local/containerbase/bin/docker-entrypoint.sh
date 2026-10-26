#!/bin/bash

if [[ -f "/usr/local/etc/env" && -z "${CONTAINERBASE_ENV+x}" ]]; then
    # shellcheck source=/dev/null
  . /usr/local/etc/env
fi

if [[ -n "${CONTAINERBASE_CLEANUP_PATH}" ]]; then
  # cleanup path via https://www.npmjs.com/package/del
  containerbase-cli cleanup path "${CONTAINERBASE_CLEANUP_PATH}"
fi

default_tmp_dir=/tmp/containerbase
# without trailing slashes, like `containerbase-cli` normalizes it
tmp_dir="${CONTAINERBASE_TMP_DIR%"${CONTAINERBASE_TMP_DIR##*[!/]}"}"
run_init=true
# a value which is empty without trailing slashes, eg. `/`, is invalid and goes through `containerbase-cli`
if [[ -z "${CONTAINERBASE_TMP_DIR}" || "${tmp_dir}" == "${default_tmp_dir}" ]]; then
  # a leftover link needs a writable target, else `containerbase-cli` repairs it
  if [[ -d "${default_tmp_dir}" && ( ! -L "${default_tmp_dir}" || ( -w "${default_tmp_dir}" && -x "${default_tmp_dir}" ) ) ]]; then
    run_init=false
  fi
# a configured value is only resolved here, a link into `/tmp` goes through `containerbase-cli`, which rejects it
elif [[ "${tmp_dir}" == /* && "${tmp_dir}" != *//* && "${tmp_dir}" != */./* && "${tmp_dir}" != */../* \
  && "${tmp_dir}" != */. && "${tmp_dir}" != */.. \
  && "$(readlink -f "${tmp_dir}")/" != /tmp/* \
  && -d "${tmp_dir}/tool.init.d" && -w "${tmp_dir}" && -x "${tmp_dir}" && ! -k "${tmp_dir}" \
  && ( "${EUID}" -ne 0 || "$(stat -L -c '%u %a' "${tmp_dir}")" =~ ^"${USER_ID}"\ [0-7]*[37][0-7][0-7]$ ) ]]; then
  # fast path: an initialized configured folder, not shared and as root owned
  # by the user with owner write and search bits, only needs the link, which
  # the home symlinks go through; `containerbase-cli` handles all other cases
  if [[ ! -e "${default_tmp_dir}" && ! -L "${default_tmp_dir}" ]]; then
    ln -s "${tmp_dir}" "${default_tmp_dir}" 2> /dev/null
  fi
  if [[ "$(readlink "${default_tmp_dir}")" == "${tmp_dir}" ]]; then
    run_init=false
  fi
fi

# a volume at `/opt/containerbase` hides the image's files, `containerbase-cli init`
# restores them from the build-time snapshot when the stamps differ, or when a
# folder to copy (`c` in `.links`) on a writable volume still links to the snapshot
snapshot_dir=/var/lib/containerbase/opt
if [[ -f "${snapshot_dir}/.stamp" ]]; then
  if [[ "$(< "${snapshot_dir}/.stamp")" != "$(cat /opt/containerbase/.stamp 2> /dev/null)" ]]; then
    run_init=true
  elif [[ -w /opt/containerbase && -f "${snapshot_dir}/.links" \
    && "$(stat -c %d /opt/containerbase)" != "$(stat -c %d /opt)" ]]; then
    while read -r flag folder; do
      if [[ "${flag}" == c && "$(readlink "/opt/containerbase/${folder}")" == "${snapshot_dir}/${folder}" ]]; then
        run_init=true
      fi
    done < "${snapshot_dir}/.links"
  fi
fi

if [[ "${run_init}" == true ]]; then
  # restores `/opt/containerbase` and initializes all prepared tools, also
  # checks and links a configured tmp dir
  containerbase-cli init tool all
  if [[ -n "${CONTAINERBASE_TMP_DIR}" && "${tmp_dir}" != "${default_tmp_dir}" \
    && ( -z "${tmp_dir}" || "$(readlink "${default_tmp_dir}")" != "${tmp_dir}" ) ]]; then
    # the cli kept the default folder for this run
    export CONTAINERBASE_TMP_DIR="${default_tmp_dir}"
  fi
fi

exec dumb-init -- "$@"
