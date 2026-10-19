#!/bin/bash

# Helpers for the containerbase temp directory, sourced by `constants.sh` and
# the `docker-entrypoint.sh`. They need `CONTAINERBASE_DEFAULT_TMP_DIR`.

# Prints the containerbase temp directory for the given `CONTAINERBASE_TMP_DIR`
# value without trailing slashes, or the default one when it's empty.
# A value which isn't an absolute normalized path, or which is the parent of the
# default directory or below it, is ignored with a warning on stderr.
function containerbase_tmp_dir () {
  local value=${1}
  local default=${CONTAINERBASE_DEFAULT_TMP_DIR}
  local tmp=${default%/*}
  local dir="${value%"${value##*[!/]}"}"

  if [[ -z "${value}" || "${dir}" == "${default}" ]]; then
    echo "${default}"
    return
  fi
  if [[ "${dir}" != /* || "${dir}" == *//* || "${dir}" == */./* || "${dir}" == */../* \
    || "${dir}" == */. || "${dir}" == */.. || "${dir}" == "${tmp}" || "${dir}" == "${tmp}"/* ]]; then
    echo "Ignoring invalid CONTAINERBASE_TMP_DIR=${value}, using ${default}" >&2
    echo "${default}"
    return
  fi
  echo "${dir}"
}

# Moves the entries of the first folder into the second one, merging folders and
# keeping the entries which already exist in the second one.
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
      mv "${entry}" "${dst}/${name}"
    elif [[ -d "${entry}" && ! -L "${entry}" && -d "${dst}/${name}" && ! -L "${dst}/${name}" ]]; then
      merge_containerbase_tmp_dir "${entry}" "${dst}/${name}"
    fi
  done
}

# Links the default temp directory to the given one, `CONTAINERBASE_TMP_DIR` by
# default. A link to another target is replaced. A folder, eg. from the base
# image, is moved into the given one first, keeping entries which exist there.
# An existing file is kept.
# Fails with an error when the current user can't replace the link or folder.
function link_containerbase_tmp_path () {
  local dir=${1:-${CONTAINERBASE_TMP_DIR}}
  local link=${CONTAINERBASE_DEFAULT_TMP_DIR}
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
      echo "${link} links to ${target}, expected ${dir}; recreate the container or run as root" >&2
      return 1
    fi
    return 0
  fi
  if [[ -d "${link}" ]]; then
    if [[ "${EUID}" -ne 0 && ! -O "${link}" ]]; then
      echo "${link} is a folder owned by another user, expected ${dir}; recreate the container or run as root" >&2
      return 1
    fi
    mkdir -p "${dir}"
    merge_containerbase_tmp_dir "${link}" "${dir}"
    rm -rf "${link}"
  elif [[ -e "${link}" ]]; then
    return 0
  fi
  ln -s "${dir}" "${link}"
}
