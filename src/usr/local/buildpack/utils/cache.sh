#!/bin/bash

# This is the cache implementation for the buildpack project.
#
# The idea is to cache tools to speed up the installation for the next installs.
# For this this file supports caching of the following:
#   * files downloaded from the internet
#   * versioned tool folders (basically all folders, but should only be used for tools right now)
#
# Caching of folders will result in an archive that will be stored in the cache.
# So it is useful for small folders only
#
# The structure of the cache is the following:
# ${BUILDPACK_CACHE_DIR}
# ├── 3018548ea9a02ddc5ba69b0044ca78bb9e65bfe0
# │   └── binary.tar.xz
# ├── 375f537df492a02fd1744a6e0973943e45163a10
# │   └── folder.tar
#
# The cache is disabled by default and will only be activated when BUILDPACK_CACHE_DIR is set.
# It also supports cleaning up the cache if there is not enough disk space.
# Cleanup will always happen on the checksum folder, not the individual files.
# This is needed to prevent breaking tools that require all files

# will attempt to download the file at the given url and stores it in the cache.
# If this file already exists, will return the cached version
# The cache will only used if BUILDPACK_CACHE_DIR is set
# First argument is the url, second one is the filename (optional)
function get_from_url () {
  local url=${1}
  check url true

  local checksum
  checksum=$(calculate_checksum "${url}")

  local name
  name=${2:-$(basename "${url}")}

  local filename="${checksum}/${name}"

  if [ -n "${BUILDPACK_CACHE_DIR}" ] && [ -e "${BUILDPACK_CACHE_DIR}/${filename}" ]; then
      # file in cache
      echo "Found file in cache: ${BUILDPACK_CACHE_DIR}/${filename}" >&2
      echo "${BUILDPACK_CACHE_DIR}/${filename}"
  else
    # cache disabled or not in cache
    download_file "${url}" "${filename}"
  fi
}

# Will download the file into the cache folder and returns the path
# If the cache is not enabled it will download it to a temp folder
# The second argument will be the filename if given
function download_file () {
  local url=${1}
  check url true

  local name
  name=${2:-$(basename "${url}")}

  local temp_folder=${BUILDPACK_CACHE_DIR:-${TEMP_DIR}}
  curl --retry 3 --create-dirs -sSfLo "${temp_folder}/${name}" "${url}"
  echo "${temp_folder}/${name}"
}

# will try to clean up the oldest file in the cache until the cache is empty
# or unless the threshold is reached
# When given true as first argument, will only delete a single file
# If BUILDPACK_CACHE_MAX_ALLOCATED_DISK is not set then the cache will be cleaned
function cleanup_cache () {
  local single_file=${1:false}

  if [ -z "${BUILDPACK_CACHE_DIR}" ]; then
    # BUILD_CACHE_DIR is not set
    exit 0
  fi

  local max_fill_level=${BUILDPACK_CACHE_MAX_ALLOCATED_DISK:-100}

  local fill_level
  local oldest
  fill_level=$(get_cache_fill_level)
  oldest=$(get_oldest_file)

  while [ "${fill_level}" -ge "${max_fill_level}" ] && [ -n "${oldest}" ]; do
    # fill level is greater then threshold and there is a file
    echo "Cache: ${fill_level}% - Cleaning up: ${oldest}"
    rm "${oldest}"

    if [ "${single_file}" = "true" ]; then
      exit 0
    fi

    fill_level=$(get_cache_fill_level)
    oldest=$(get_oldest_file)
  done
}

# Will get the oldest file in the cache and returns the path to it
function get_oldest_file () {
  check BUILDPACK_CACHE_DIR true
  find "${BUILDPACK_CACHE_DIR}" -type f -printf '%T+ %p\n' | sort | head -n 1 | awk '{ print $2 }'
}

# Get the current fill level for the cache dir in percent
function get_cache_fill_level () {
  check BUILDPACK_CACHE_DIR true
  df --output=pcent "${BUILDPACK_CACHE_DIR}" | tr -dc '0-9'
}

# Will calculate the checksum for the given string
function calculate_checksum () {
  local text=$1
  echo "${text}" | sha1sum | awk '{print $1}'
}

# Will cache the given folder under a given key in the cache
# Any existing entry under the given key will be overriden
# If the key is not passed, then the path will be used as key
#
# Only enabled when BUILDPACK_CACHE_DIR is set, noop otherwise
#
# Will return the path to the cached folder as tar file
function cache_folder () {
  local path=$1
  local key=${2:-${1}}

  check path true
  check key true

  if [ -z "${BUILDPACK_CACHE_DIR}" ]; then
    # BUILD_CACHE_DIR is not set
    exit 0
  fi

  local checksum
  checksum=$(calculate_checksum "${key}")

  local filename="${checksum}/folder.tar"
  local cache_path="${BUILDPACK_CACHE_DIR}/${filename}"

  # create folder
  mkdir -p "${BUILDPACK_CACHE_DIR}/${checksum}"

  # remove file if it exists
  if [ -e "${cache_path}" ]; then
    rm "${cache_path}"
  fi

  # tar folder
  tar -cf "${cache_path}" -C "${path}" .
  echo "${cache_path}"
}

# Will restore the folder from the cache by the given key
# at the given path, will exit out if there is an error or the cache
# entry does not exist
# If the key is not passed, then the path will be used as key
# The folder to extract to needs to exist
function restore_folder_from_cache () {
  local path=$1
  local key=${2:-${1}}

  check path true
  check key true

  if [ -z "${BUILDPACK_CACHE_DIR}" ]; then
    # BUILD_CACHE_DIR is not set
    echo 1
    return
  fi

  local checksum
  checksum=$(calculate_checksum "${key}")

  local filename="${checksum}/folder.tar"
  local cache_path="${BUILDPACK_CACHE_DIR}/${filename}"

  if [ ! -e "${cache_path}" ]; then
    # not in cache
    echo 1
    return
  fi

  # untar folder
  tar -xvf "${cache_path}" -C "${path}"
  echo 0
}
