# shellcheck disable=SC2034,SC2148,SC2155

setup() {
  load "$BATS_SUPPORT_LOAD_PATH"
  load "$BATS_ASSERT_LOAD_PATH"

  TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../src/usr/local/containerbase/util.sh"

  # load test overwrites
  load "$TEST_DIR/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "get_oldest_file" {

  CONTAINERBASE_CACHE_DIR='' \
  run get_oldest_file
  assert_failure

  # create cache dir
  CONTAINERBASE_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${CONTAINERBASE_CACHE_DIR}"

  run get_oldest_file
  assert_success
  assert_output ""

  # create files
  touch "${CONTAINERBASE_CACHE_DIR}/b"
  # sleep for a milisecond, otherwise the files have the same age
  # and then it will get sorted by name
  sleep 0.01
  touch "${CONTAINERBASE_CACHE_DIR}/a"

  run get_oldest_file
  assert_success
  assert_output "${CONTAINERBASE_CACHE_DIR}/b"
}

@test "get_cache_fill_level" {
  local TEST_FILL_LEVEL=88

  CONTAINERBASE_CACHE_DIR='' \
  run get_cache_fill_level
  assert_failure

  # create cache dir
  CONTAINERBASE_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${CONTAINERBASE_CACHE_DIR}"

  local real_fill_level=$(get_cache_fill_level)
  assert test "[[ ""$real_fill_level"" =~ ^[0-9]+$ ]]"

  # overwrite function to verify deletion
  # shellcheck disable=SC2317
  function get_cache_fill_level () {
    echo "$TEST_FILL_LEVEL"
  }

  run get_cache_fill_level
  assert_output "88"

  TEST_FILL_LEVEL=12 \
  run get_cache_fill_level
  assert_output "12"
}

@test "cache delete" {
  local TEST_FILL_LEVEL=88
  local CONTAINERBASE_MAX_ALLOCATED_DISK=50

  # overwrite function to verify deletion
  function get_cache_fill_level () {
    echo $TEST_FILL_LEVEL
  }

  run cleanup_cache
  assert_success

  # create cache dir
  CONTAINERBASE_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${CONTAINERBASE_CACHE_DIR}/b"

  # create files
  touch "${CONTAINERBASE_CACHE_DIR}/c"
  sleep 0.01
  touch "${CONTAINERBASE_CACHE_DIR}/b/test"
  sleep 0.01
  touch "${CONTAINERBASE_CACHE_DIR}/a"

  CONTAINERBASE_CACHE_DIR='' \
  CONTAINERBASE_MAX_ALLOCATED_DISK='' \
  run cleanup_cache
  assert_success

  CONTAINERBASE_CACHE_DIR='' \
  CONTAINERBASE_MAX_ALLOCATED_DISK=20 \
  run cleanup_cache
  assert_success

  CONTAINERBASE_MAX_ALLOCATED_DISK='' \
  run cleanup_cache
  assert_success
  assert [ -e "${CONTAINERBASE_CACHE_DIR}/a" ]
  assert [ -e "${CONTAINERBASE_CACHE_DIR}/b/test" ]
  assert [ -e "${CONTAINERBASE_CACHE_DIR}/c" ]

  run cleanup_cache true
  assert_success
  assert [ -e "${CONTAINERBASE_CACHE_DIR}/a" ]
  assert [ -e "${CONTAINERBASE_CACHE_DIR}/b/test" ]
  assert [ ! -e "${CONTAINERBASE_CACHE_DIR}/c" ]

  TEST_FILL_LEVEL=30 \
  run cleanup_cache
  assert_success
  assert [ -e "${CONTAINERBASE_CACHE_DIR}/a" ]
  assert [ -e "${CONTAINERBASE_CACHE_DIR}/b/test" ]
  assert [ ! -e "${CONTAINERBASE_CACHE_DIR}/c" ]

  TEST_FILL_LEVEL=90 \
  run cleanup_cache
  assert_success
  assert [ ! -e "${CONTAINERBASE_CACHE_DIR}/a" ]
  assert [ ! -e "${CONTAINERBASE_CACHE_DIR}/b/test" ]
  assert [ ! -e "${CONTAINERBASE_CACHE_DIR}/c" ]
}

@test "download_file" {
  # create cache dir
  CONTAINERBASE_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${CONTAINERBASE_CACHE_DIR}"

  local file="https://github.com/containerbase/base/releases/download/7.10.0/containerbase.tar.xz"

  run download_file
  assert_failure
  assert_output "param url is set but empty"

  run download_file "${file}zzz"
  assert_failure
  assert_line "Download failed: ${file}zzz"

  run download_file "${file}"
  assert_success
  assert_line "${CONTAINERBASE_CACHE_DIR}/containerbase.tar.xz"

  run download_file "${file}" "foobar"
  assert_success
  assert_line "${CONTAINERBASE_CACHE_DIR}/foobar"

  CONTAINERBASE_CACHE_DIR='' \
  tmp_file=$(download_file "${file}")
  rm "${tmp_file}"

  # shellcheck disable=SC1001,SC2140
  assert test "[[ ""${tmp_file}"" =~ "\/containerbase.tar.xz" ]]"
}

@test "get_from_url" {
  # create cache dir
  CONTAINERBASE_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${CONTAINERBASE_CACHE_DIR}"

  local file="https://github.com/containerbase/base/releases/download/7.10.0/containerbase.tar.xz"

  run get_from_url "${file}"
  assert_success
  assert_line --regexp "^${CONTAINERBASE_CACHE_DIR}/[0-9a-f]{64}/containerbase\.tar\.xz"

  run get_from_url "${file}" test
  assert_success
  assert_line --regexp "${CONTAINERBASE_CACHE_DIR}/[0-9a-f]{64}/test"

  # overwrite donwload function to fail
  function download_file () {
    exit 1
  }

  run get_from_url "${file}"
  assert_success
  assert_output --regexp "${CONTAINERBASE_CACHE_DIR}/[0-9a-f]{64}/containerbase\.tar\.xz"

  run get_from_url "${file}" "test"
  assert_success
  assert_output --regexp "${CONTAINERBASE_CACHE_DIR}/[0-9a-f]{64}/test"
}

@test "get_from_url_with_checksum" {
  # create cache dir
  CONTAINERBASE_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${CONTAINERBASE_CACHE_DIR}"

  # sha512sum of file
  local checksum="233c335a7f10e9f0dfd7e9d0cda802a38c15a7f13b6678c55980814f22799a70590d56888a819b6591881ec1939240d9dbe68e7e495021b4d6c6a49cdee24d80"
  local file="https://github.com/containerbase/base/releases/download/7.10.0/containerbase.tar.xz"

  run get_from_url "${file}" "$(basename "${file}")" "${checksum}" "sha512sum"
  assert_success
  assert_line --regexp "^${CONTAINERBASE_CACHE_DIR}/[0-9a-f]{64}/containerbase\.tar\.xz"

  rm -rf "${CONTAINERBASE_CACHE_DIR}"

  run get_from_url "${file}" test "${checksum}" "sha512sum"
  assert_success
  assert_line --regexp "${CONTAINERBASE_CACHE_DIR}/[0-9a-f]{64}/test"

  rm -rf "${CONTAINERBASE_CACHE_DIR}"

  # wrong checksum
  run get_from_url "${file}" "$(basename "${file}")" "123" "sha256sum"
  assert_failure
  assert_output --partial "Retries left: 2"
  assert_output --partial "Retries left: 1"
  assert_output --partial "Retries left: 0"

  rm -rf "${CONTAINERBASE_CACHE_DIR}"

  run get_from_url "${file}" test "123" "sha256sum"
  assert_failure
  assert_output --partial "Retries left: 2"
  assert_output --partial "Retries left: 1"
  assert_output --partial "Retries left: 0"
}

@test "get_from_url_with_cache_and_checksum" {
  bats_require_minimum_version 1.5.0
  # create cache dir
  CONTAINERBASE_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${CONTAINERBASE_CACHE_DIR}"

  # sha512sum of file
  local checksum="233c335a7f10e9f0dfd7e9d0cda802a38c15a7f13b6678c55980814f22799a70590d56888a819b6591881ec1939240d9dbe68e7e495021b4d6c6a49cdee24d80"
  local file="https://github.com/containerbase/base/releases/download/7.10.0/containerbase.tar.xz"

  run --separate-stderr get_from_url "${file}" "$(basename "${file}")" "${checksum}" "sha512sum"
  assert_success
  assert_output --regexp "^${CONTAINERBASE_CACHE_DIR}/[0-9a-f]{64}/containerbase\.tar\.xz"

  file_path="${output}"

  run get_from_url "${file}" test "${checksum}" "sha512sum"
  assert_success
  assert_line --regexp "${CONTAINERBASE_CACHE_DIR}/[0-9a-f]{64}/test"

  # change checksum of cached file
  echo "a" >> "${file_path}"

  # corrupt file in cache
  run get_from_url "${file}" "$(basename "${file}")" "${checksum}" "sha512sum"
  assert_success
  assert_output --partial "Cached file is corrupt"
}

@test "cache_folder" {
    # set up the cache
  load "$TEST_DIR/cache.sh"
  CONTAINERBASE_CACHE_DIR="$(create_temp_dir TEST_CACHE_DIR)"
  CONTAINERBASE_CACHE_FOLDERS="true"

  # create "tool" folder
  tool_folder=$(mktemp -u)
  mkdir -p "${tool_folder}"
  touch "${tool_folder}/a"
  touch "${tool_folder}/b"

  local key
  key=$(random_word)

  local key_checksum
  key_checksum=$(calculate_checksum "${key}")

  local path_checksum
  path_checksum=$(calculate_checksum "${tool_folder}")

  run cache_folder "${tool_folder}" "${key}"
  assert_success
  assert_output --regexp "^${CONTAINERBASE_CACHE_DIR}/${key_checksum}/folder\.tar\.zst"

  run cache_folder "${tool_folder}"
  assert_success
  assert_output --regexp "^${CONTAINERBASE_CACHE_DIR}/${path_checksum}/folder\.tar\.zst"

  # delete cache entry
  rm -rf "${CONTAINERBASE_CACHE_DIR:?}/${key_checksum}"
  rm -rf "${CONTAINERBASE_CACHE_DIR:?}/${path_checksum}"
}

@test "restore_folder_from_cache" {
  # set up the cache
  load "$TEST_DIR/cache.sh"
  CONTAINERBASE_CACHE_DIR="$(create_temp_dir TEST_CACHE_DIR)"
  CONTAINERBASE_CACHE_FOLDERS="true"

  # create "tool" folder
  tool_folder=$(mktemp -u)
  mkdir -p "${tool_folder}"
  touch "${tool_folder}/a"
  touch "${tool_folder}/b"

  local key
  key="$(random_word)"

  local key_checksum
  key_checksum=$(calculate_checksum "${key}")

  local path_checksum
  path_checksum=$(calculate_checksum "${tool_folder}")

  run cache_folder "${tool_folder}" "${key}"
  assert_success
  assert_output --regexp "^${CONTAINERBASE_CACHE_DIR}/${key_checksum}/folder\.tar\.zst"

  run cache_folder "${tool_folder}"
  assert_success
  assert_output --regexp "^${CONTAINERBASE_CACHE_DIR}/${path_checksum}/folder\.tar\.zst"

  # test with key

  # delete entries
  rm "${tool_folder}/a" "${tool_folder}/b"

  assert [ ! -e "${tool_folder}/a" ]
  assert [ ! -e "${tool_folder}/b" ]

  # restore
  run restore_folder_from_cache "${tool_folder}" "${key}"
  assert_success

  assert [ -e "${tool_folder}/a" ]
  assert [ -e "${tool_folder}/b" ]

  # test without key

  # delete entries
  rm "${tool_folder}/a" "${tool_folder}/b"

  assert [ ! -e "${tool_folder}/a" ]
  assert [ ! -e "${tool_folder}/b" ]

  # restore
  run restore_folder_from_cache "${tool_folder}"
  assert_success

  assert [ -e "${tool_folder}/a" ]
  assert [ -e "${tool_folder}/b" ]

  # delete cache entry
  rm -rf "${CONTAINERBASE_CACHE_DIR:?}/${key_checksum}"
  rm -rf "${CONTAINERBASE_CACHE_DIR:?}/${path_checksum}"
}
