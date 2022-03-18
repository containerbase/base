#!/bin/bash

# will attempt to download the file at the given url and stores it in the cache.
# If this file already exists, will return the cached version
# The cache will only used if BUILDPACK_CACHE_DIR is set
# First argument is the url, second one is the filename (optional)
function get_from_url () {
  local url=${1}
  check url true

  local checksum
  checksum=$(echo "${url}" | sha1sum | awk '{print $1}')

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
#
# If the download receives an error, the output will be given on stderr
# and an empty string is returned
function download_file () {
  local url=${1}
  check url true

  local name
  name=${2:-$(basename "${url}")}

  local temp_folder=${BUILDPACK_CACHE_DIR:-${TEMP_DIR}}
  if curl --create-dirs -sSfLo "${temp_folder}/${name}" "${url}" >/dev/null 2>&1 ; then
    echo "${temp_folder}/${name}"
  fi
}

# will try to clean up the oldest file in the cache until the cache is empty
# or unless the threshold is reached
# When given true as first argument, will only delete a single file
# If BUILDPACK_CACHE_MAX_ALLOCATED_DISK is not set then the cache will be cleaned
function cleanup_cache () {
  local single_file=${1:false}

  if [ -z "${BUILDPACK_CACHE_DIR}" ]; then
    # BUILD_CACHE_DIR is empty
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
