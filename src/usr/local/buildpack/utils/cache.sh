#!/bin/bash

# will attempt to download the file at the given url and stores it in the cache.
# If this file already exists, will return the cached version
# The cache will only used if BUILDPACK_CACHE_DIR is set
# First argument is the url, second one is the filename (optional)
function get_from_url () {
  local url=${1}
  check url true

  local name
  name=${2:-$(basename ${url})}

  if [ -n "${BUILDPACK_CACHE_DIR}" ] && [ -e "${BUILDPACK_CACHE_DIR}/${name}" ]; then
      # file in cache
      echo "Found file in cache: ${BUILDPACK_CACHE_DIR}/${name}" >&2
      echo "${BUILDPACK_CACHE_DIR}/${name}"
  else
    # cache disabled or not in cache
    download_file $url $name
  fi
}

# Will download the file into the cache folder and returns the path
# If the cache is not enabled it will download it to a temp folder
# The second argument will be the filename if given
function download_file () {
  local url=${1}
  check url true

  local name
  name=${2:-$(basename ${url})}

  local temp_folder=${BUILDPACK_CACHE_DIR:-$(mktemp -u)}
  curl --create-dirs -sSfLo "${temp_folder}/${name}" "${url}"
  echo "${temp_folder}/${name}"
}

# will try to clean up the oldest file in the cache until the cache is empty
# or unless the threshold is reached
# When given true as first argument, will only delete a single file
# If BUILDPACK_CACHE_MAX_ALLOCATED_DISK is not set then the cache will be cleaned
function cleanup_cache () {
  local single_file=${1:false}
  check BUILDPACK_CACHE_DIR true

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
  echo $(find ${BUILDPACK_CACHE_DIR} -type f -printf '%T+ %p\n' | sort | head -n 1 | awk '{ print $2 }')
}

# Get the current fill level for the cache dir in percent
function get_cache_fill_level () {
  check BUILDPACK_CACHE_DIR true
  echo $(df --output=pcent ${BUILDPACK_CACHE_DIR} | tr -dc '0-9')
}
