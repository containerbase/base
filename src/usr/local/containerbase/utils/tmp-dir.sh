#!/bin/bash

# Helpers for the containerbase temp directory, sourced by `constants.sh` and
# the `docker-entrypoint.sh`. They need `CONTAINERBASE_DEFAULT_TMP_DIR`.

# Prints the containerbase temp directory for the given `CONTAINERBASE_TMP_DIR`
# value without trailing slashes, or the default one when it's empty.
# A value which isn't an absolute normalized path, or which is the parent of the
# default directory or below it, is ignored: prints the default directory and
# returns 1. The warning on stderr is skipped when `CONTAINERBASE_TMP_DIR_WARNED`
# is set, callers export it after the first warning.
function containerbase_tmp_dir () {
  local value=${1}
  local default=${CONTAINERBASE_DEFAULT_TMP_DIR}
  local tmp=${default%/*}
  local dir="${value%"${value##*[!/]}"}"

  if [[ -z "${value}" || "${dir}" == "${default}" ]]; then
    echo "${default}"
    return 0
  fi
  if [[ "${dir}" != /* || "${dir}" == *//* || "${dir}" == */./* || "${dir}" == */../* \
    || "${dir}" == */. || "${dir}" == */.. || "${dir}" == "${tmp}" || "${dir}" == "${tmp}"/* ]]; then
    if [[ -z "${CONTAINERBASE_TMP_DIR_WARNED}" ]]; then
      echo "Ignoring invalid CONTAINERBASE_TMP_DIR=${value}, using ${default}" >&2
    fi
    echo "${default}"
    return 1
  fi
  echo "${dir}"
}

# Creates the given temp directory and its parents, when it's missing. The
# directory gets mode 775 and, when running as root, is owned by `USER_ID`,
# like `set_file_owner` does. A link to a directory is accepted.
function create_containerbase_tmp_dir () {
  local dir=${1}
  local parent=${dir%/*}

  if [[ -d "${dir}" ]]; then
    return 0
  fi
  if [[ -n "${parent}" ]]; then
    mkdir -p "${parent}" || return 1
  fi
  mkdir -m 775 "${dir}" || return 1
  if [[ "${EUID}" -eq 0 && -n "${USER_ID}" ]]; then
    chown "${USER_ID}" "${dir}" || return 1
  fi
}

# Moves the entries of the first folder into the second one, merging folders and
# keeping the entries which already exist in the second one.
# Returns 1 on the first failed move.
function merge_containerbase_tmp_dir () {
  local src=${1}
  local dst=${2}
  local entry
  local name

  for entry in "${src}"/* "${src}"/.[!.]* "${src}"/..?*; do
    if [[ ! -e "${entry}" && ! -L "${entry}" ]]; then
      continue
    fi
    name=${entry##*/}
    if [[ ! -e "${dst}/${name}" && ! -L "${dst}/${name}" ]]; then
      mv "${entry}" "${dst}/${name}" || return 1
    elif [[ -d "${entry}" && ! -L "${entry}" && -d "${dst}/${name}" && ! -L "${dst}/${name}" ]]; then
      merge_containerbase_tmp_dir "${entry}" "${dst}/${name}" || return 1
    fi
  done
}

# Links the default temp directory to the given one, `CONTAINERBASE_TMP_DIR` by
# default. A link to another target is replaced. A folder, eg. from the base
# image, is moved into the given one first, keeping entries which exist there,
# and only removed when the whole move succeeded. An existing file is kept.
# When the current user can't replace the link or folder, or the move fails,
# warns and returns 1, so the caller keeps using the default directory.
function link_containerbase_tmp_path () {
  local dir=${1:-${CONTAINERBASE_TMP_DIR}}
  local link=${CONTAINERBASE_DEFAULT_TMP_DIR}
  local warning="cannot switch ${link} to ${dir}, keeping the default folder; switch it at image build time as root"
  local target

  if [[ "${dir}" == "${link}" ]]; then
    return 0
  fi
  if [[ -L "${link}" ]]; then
    target=$(readlink "${link}")
    if [[ "${target}" == "${dir}" ]]; then
      return 0
    fi
    if ! ln -sfn "${dir}" "${link}" 2> /dev/null; then
      echo "${warning}" >&2
      return 1
    fi
    return 0
  fi
  if [[ -d "${link}" ]]; then
    # removing it from the sticky `/tmp` would fail after moving its content
    if [[ "${EUID}" -ne 0 && ! -O "${link}" ]] \
      || ! create_containerbase_tmp_dir "${dir}" \
      || ! merge_containerbase_tmp_dir "${link}" "${dir}" \
      || ! rm -rf "${link}"; then
      echo "${warning}" >&2
      return 1
    fi
  elif [[ -e "${link}" ]]; then
    return 0
  fi
  ln -s "${dir}" "${link}"
}
