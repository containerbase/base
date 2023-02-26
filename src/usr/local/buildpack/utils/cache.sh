#!/bin/bash

# This is the cache implementation for the buildpack project.
#
# The idea is to cache tools to speed up the installation for the next installs.
# Currently supported:
#   * urls which resolves to binary files downloaded from the internet
#   * folders (basically all folders, but should only be used for versioned tool folders right now)
#
# Cached folders will be stored as an archive file in the cache.
# Cached urls will be stored as is in the cache.
#
# The structure of the cache is the following:
# ${BUILDPACK_CACHE_DIR}
# ├── 3018548ea9a02ddc5ba69b0044ca78bb9e65bfe0
# │   └── binary.tar.xz
# ├── 375f537df492a02fd1744a6e0973943e45163a10
# │   └── folder.tar
#
# The base name of cached urls will be sha256 hashed and used as folder name
# The path of folders will be sha256 hashed and used as folder name.
#
# The url cache is disabled by default and will only be activated when BUILDPACK_CACHE_DIR is set.
# The fodler cache is disabled by default and will only be activated when BUILDPACK_CACHE_DIR and BUILDPACK_CACHE_FOLDERS is set.
#
# The cache supports a cleanup function if there is not enough disk space.
# The function will always work on the checksum folder, not the individual files inside the folders.


# will attempt to download the file at the given url and stores it in the cache.
# If this file already exists, will return the cached version
# The cache will only used if BUILDPACK_CACHE_DIR is set
# First argument is the url
# Second argument is the filename (optional)
# Third argument is the checksum that the file should have (optional)
# Fourth argument is the checksum algorithm (optional)
function get_from_url () {
  local url=${1}
  check url true

  local checksum
  checksum=$(calculate_checksum "${url}")

  local name
  name=${2:-$(basename "${url}")}

  local expected_checksum
  expected_checksum=${3}

  local checksum_algo
  checksum_algo=${4}

  local filename="${checksum}/${name}"

  if [ -n "${BUILDPACK_CACHE_DIR}" ] && [ -e "${BUILDPACK_CACHE_DIR}/${filename}" ]; then
      # file in cache, verify checksum first
      if [ -n "${expected_checksum}" ] && ! verify_checksum "${BUILDPACK_CACHE_DIR}/${filename}" "${expected_checksum}" "${checksum_algo}" ; then
        # file in cache but checksum doesn't match, so remove file and download again
        echo "Cached file is corrupt, redownloading: ${BUILDPACK_CACHE_DIR}/${filename}" >&2
        rm -rf "${BUILDPACK_CACHE_DIR:?}/${filename}"
        download_file "${url}" "${filename}" "${expected_checksum}" "${checksum_algo}"
      else
        echo "${BUILDPACK_CACHE_DIR}/${filename}"
      fi
  else
    # cache disabled or not in cache
    download_file "${url}" "${filename}" "${expected_checksum}" "${checksum_algo}"
  fi
}

# Will download the file into the cache folder and returns the path
# If the cache is not enabled it will download it to a temp folder
# The second argument will be the filename if given (optional)
# The third argument is the exepcted checksum of the file if given (optional)
# The fourth argument is the checksum algorithm (optional)
function download_file () {
  local url=${1}
  check url true

  local name
  name=${2:-$(basename "${url}")}

  local expected_checksum
  expected_checksum=${3}

  local checksum_algo
  checksum_algo=${4}

  local retry=3
  local temp_folder=${BUILDPACK_CACHE_DIR:-${TEMP_DIR}}
  while [ "${retry}" -gt 0 ]; do
    retry=$((retry-1))
    if ! curl --retry 3 --create-dirs -sSfLo "${temp_folder}/${name}" "${url}" ; then
      echo "Download failed: ${url}" >&2
      exit 1
    fi;

    # verify checksum if given
    if [ -n "${expected_checksum}" ]; then
      if ! verify_checksum "${temp_folder}/${name}" "${expected_checksum}" "${checksum_algo}" ; then
        echo "Retries left: ${retry}" >&2
        # clean up what we downloaded so far
        rm "${temp_folder}/${name}"
        if [ "${retry}" -le 0 ]; then
          echo "Checksum verification failed: ${url}" >&2
          exit 1
        fi
        echo "Checksum verification failed, retrying" >&2
        continue
      fi
    fi
    retry=0
  done

  echo "${temp_folder}/${name}"
}

# Will verify if the given checksum matches the given file
# First argument is the path to the file
# Second argument is the checksum
# Third argument is the type, currently supported:
# * sha1
# * sha224sum
# * sha256sum
# * sha384sum
# * sha512sum
function verify_checksum () {
  local file=${1}
  check file true

  local expected_checksum=${2}
  check expected_checksum true

  local algorithm=${3}
  check algorithm true


  # prevent executing the algorithm blindly
  # so use this switch case statement
  case $algorithm in
    sha1sum)
      real_checksum=$(sha1sum "${file}" | cut -d' ' -f1)
      ;;
    sha224sum)
      real_checksum=$(sha224sum "${file}" | cut -d' ' -f1)
      ;;
    sha256sum)
      real_checksum=$(sha256sum "${file}" | cut -d' ' -f1)
      ;;
    sha384sum)
      real_checksum=$(sha384sum "${file}" | cut -d' ' -f1)
      ;;
    sha512sum)
      real_checksum=$(sha512sum "${file}" | cut -d' ' -f1)
      ;;
    *)
      echo "Non supported checksum algorithm: ${algorithm}" >&2
      return 1
      ;;
  esac
  if [ "$real_checksum" != "$expected_checksum" ]; then
    echo "Checksum does not match for file ${file}. Expected: '${expected_checksum}' - Got: '${real_checksum}'" >&2
    return 1
  fi
  return 0
}

# will try to clean up the oldest file in the cache until the cache is empty
# or unless the threshold is reached
# When given true as first argument, will only delete a single file
# If BUILDPACK_CACHE_MAX_ALLOCATED_DISK is not set then the cache will be cleaned
function cleanup_cache () {
  local single_file=${1:false}

  if [ -z "${BUILDPACK_CACHE_DIR}" ] || [ ! -d "${BUILDPACK_CACHE_DIR}" ]; then
    # BUILD_CACHE_DIR is not set or doesn't exist
    return
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
      return
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
  echo "${text}" | sha256sum | awk '{print $1}'
}

# Will cache the given folder under a given key in the cache
# Any existing entry under the given key will be overriden
# If the key is not passed, then the path will be used as key
#
# Only enabled when BUILDPACK_CACHE_DIR and BUILDPACK_CACHE_FOLDERS is set, noop otherwise
#
# Will return the path to the cached folder as tar file
function cache_folder () {
  local path=$1
  local key=${2:-${1}}

  check path true
  check key true

  if [ -z "${BUILDPACK_CACHE_DIR}" ] || [ -z "${BUILDPACK_CACHE_FOLDERS}" ]; then
    # BUILD_CACHE_DIR is not set
    return
  fi

  local checksum
  checksum=$(calculate_checksum "${key}")

  local filename="${checksum}/folder.tar.zst"
  local cache_path="${BUILDPACK_CACHE_DIR}/${filename}"

  # create folder with root umask
  create_folder "${BUILDPACK_CACHE_DIR}/${checksum}" "${ROOT_UMASK}"

  # remove file if it exists
  if [ -e "${cache_path}" ]; then
    rm "${cache_path}"
  fi

  # tar folder
  tar -C "${path}" -cf - . | zstd -qq --no-progress -z -T0 --long=30 -o "${cache_path}"
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

  if [ -z "${BUILDPACK_CACHE_DIR}" ] || [ -z "${BUILDPACK_CACHE_FOLDERS}" ]; then
    # BUILD_CACHE_DIR is not set
    echo 1
    return
  fi

  local checksum
  checksum=$(calculate_checksum "${key}")

  local filename="${checksum}/folder.tar.zst"
  local cache_path="${BUILDPACK_CACHE_DIR}/${filename}"

  if [ ! -e "${cache_path}" ]; then
    # not in cache
    echo 1
    return
  fi

  # untar folder
  zstd -qq --no-progress -c -d -T0 --long=30 "${cache_path}" | tar -C "${path}" -xpf -
  echo 0
}
