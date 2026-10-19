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

# Whether the current user is root, a function so tests can override it.
function is_containerbase_tmp_dir_root () {
  [[ "${EUID}" -eq 0 ]]
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
  if is_containerbase_tmp_dir_root && [[ -n "${USER_ID}" ]]; then
    chown "${USER_ID}" "${dir}" || return 1
  fi
}

# Creates the given temp directory when it's missing, see
# `create_containerbase_tmp_dir`, and returns 1 when that fails or the current
# user can't write it.
function usable_containerbase_tmp_dir () {
  local dir=${1}

  create_containerbase_tmp_dir "${dir}" && [[ -w "${dir}" && -x "${dir}" ]]
}

# Moves the entries of the first folder into the second one, merging folders and
# keeping the entries which already exist in the second one.
# Returns 1 on the first failed move.
function merge_containerbase_tmp_dir () {
  local src=${1}
  local dst=${2}
  local entry
  local to

  for entry in "${src}"/* "${src}"/.[!.]* "${src}"/..?*; do
    if [[ ! -e "${entry}" && ! -L "${entry}" ]]; then
      continue
    fi
    to="${dst}/${entry##*/}"
    if [[ ! -e "${to}" && ! -L "${to}" ]]; then
      mv "${entry}" "${to}" || return 1
    elif [[ -d "${entry}" && ! -L "${entry}" && -d "${to}" && ! -L "${to}" ]]; then
      merge_containerbase_tmp_dir "${entry}" "${to}" || return 1
    fi
  done
}

# Links the default temp directory to the given one, `CONTAINERBASE_TMP_DIR` by
# default. A link to another target is replaced. As root, a folder, eg. from the
# base image, is moved into the given one first, keeping entries which exist
# there, and only removed when the whole move succeeded.
# The given directory is created first and has to be writable, else no link is
# created or replaced.
# When the given directory isn't usable, the link can't be replaced, a folder
# exists as non-root, or the move fails, warns and returns 1, so the caller
# keeps using the default directory.
# Prints an error and returns 2 when the default path is a file.
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
    if ! usable_containerbase_tmp_dir "${dir}" || ! ln -sfn "${dir}" "${link}" 2> /dev/null; then
      echo "${warning}" >&2
      return 1
    fi
    return 0
  fi
  if [[ -d "${link}" ]]; then
    # removing it from the sticky `/tmp` needs root
    if ! is_containerbase_tmp_dir_root \
      || ! usable_containerbase_tmp_dir "${dir}" \
      || ! merge_containerbase_tmp_dir "${link}" "${dir}" \
      || ! rm -rf "${link}"; then
      echo "${warning}" >&2
      return 1
    fi
  elif [[ -e "${link}" ]]; then
    echo "${link} is a file, remove it" >&2
    return 2
  elif ! usable_containerbase_tmp_dir "${dir}"; then
    echo "${warning}" >&2
    return 1
  fi
  ln -s "${dir}" "${link}"
}
