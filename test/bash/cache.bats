
setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

    TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
    TEST_ROOT_DIR=$(mktemp -u)

    load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"

    # load test overwrites
    load "$TEST_DIR/util.sh"

    # set directories for test
    ROOT_DIR="${TEST_ROOT_DIR}/root"
    BIN_DIR="${TEST_ROOT_DIR}/bin"
    USER_HOME="${TEST_ROOT_DIR}/user"
    ENV_FILE="${TEST_ROOT_DIR}/env"

    # set default test user
    TEST_ROOT_USER=1000
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "get_oldest_file" {

  BUILDPACK_CACHE_DIR= \
  run get_oldest_file
  assert_failure

  # create cache dir
  BUILDPACK_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${BUILDPACK_CACHE_DIR}"

  run get_oldest_file
  assert_success
  assert_output ""

  # create files
  touch "${BUILDPACK_CACHE_DIR}/b"
  # sleep for a milisecond, otherwise the files have the same age
  # and then it will get sorted by name
  sleep 0.01
  touch "${BUILDPACK_CACHE_DIR}/a"

  run get_oldest_file
  assert_success
  assert_output "${BUILDPACK_CACHE_DIR}/b"
}

@test "get_cache_fill_level" {
  local TEST_FILL_LEVEL=88

  BUILDPACK_CACHE_DIR= \
  run get_cache_fill_level
  assert_failure

  # create cache dir
  BUILDPACK_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${BUILDPACK_CACHE_DIR}"

  local real_fill_level=$(get_cache_fill_level)
  assert test "[[ "$real_fill_level" =~ ^[0-9]+$ ]]"

  # overwrite function to verify deletion
  function get_cache_fill_level () {
    echo $TEST_FILL_LEVEL
  }

  run get_cache_fill_level
  assert_output "88"

  TEST_FILL_LEVEL=12 \
  run get_cache_fill_level
  assert_output "12"
}

@test "cache delete" {
  local TEST_FILL_LEVEL=88
  local BUILDPACK_CACHE_MAX_ALLOCATED_DISK=50

  # overwrite function to verify deletion
  function get_cache_fill_level () {
    echo $TEST_FILL_LEVEL
  }

  run cleanup_cache
  assert_success

  # create cache dir
  BUILDPACK_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${BUILDPACK_CACHE_DIR}/b"

  # create files
  touch "${BUILDPACK_CACHE_DIR}/c"
  sleep 0.01
  touch "${BUILDPACK_CACHE_DIR}/b/test"
  sleep 0.01
  touch "${BUILDPACK_CACHE_DIR}/a"

  BUILDPACK_CACHE_DIR= \
  BUILDPACK_CACHE_MAX_ALLOCATED_DISK= \
  run cleanup_cache
  assert_success

  BUILDPACK_CACHE_DIR= \
  BUILDPACK_CACHE_MAX_ALLOCATED_DISK=20 \
  run cleanup_cache
  assert_success

  BUILDPACK_CACHE_MAX_ALLOCATED_DISK= \
  run cleanup_cache
  assert_success
  assert [ -e "${BUILDPACK_CACHE_DIR}/a" ]
  assert [ -e "${BUILDPACK_CACHE_DIR}/b/test" ]
  assert [ -e "${BUILDPACK_CACHE_DIR}/c" ]

  run cleanup_cache true
  assert_success
  assert [ -e "${BUILDPACK_CACHE_DIR}/a" ]
  assert [ -e "${BUILDPACK_CACHE_DIR}/b/test" ]
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/c" ]

  TEST_FILL_LEVEL=30 \
  run cleanup_cache
  assert_success
  assert [ -e "${BUILDPACK_CACHE_DIR}/a" ]
  assert [ -e "${BUILDPACK_CACHE_DIR}/b/test" ]
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/c" ]

  TEST_FILL_LEVEL=90 \
  run cleanup_cache
  assert_success
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/a" ]
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/b/test" ]
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/c" ]
}

@test "download_file" {
  # create cache dir
  BUILDPACK_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${BUILDPACK_CACHE_DIR}"

  local file="https://github.com/containerbase/buildpack/releases/download/1.0.0/buildpack.tar.xz"

  run download_file
  assert_failure

  run download_file "${file}"
  assert_success
  assert_output "${BUILDPACK_CACHE_DIR}/buildpack.tar.xz"

  run download_file "${file}" "foobar"
  assert_success
  assert_output "${BUILDPACK_CACHE_DIR}/foobar"

  BUILDPACK_CACHE_DIR= \
  tmp_file=$(download_file "${file}")
  rm "${tmp_file}"

  assert test "[[ "${tmp_file}" =~ "\/buildpack.tar.xz" ]]"
}

@test "get_from_url" {
  # create cache dir
  BUILDPACK_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${BUILDPACK_CACHE_DIR}"

  local file="https://github.com/containerbase/buildpack/releases/download/1.0.0/buildpack.tar.xz"

  run get_from_url "${file}"
  assert_success
  assert_output --regexp "^${BUILDPACK_CACHE_DIR}/[0-9a-f]{40}/buildpack\.tar\.xz"

  run get_from_url "${file}" test
  assert_success
  assert_output --regexp "${BUILDPACK_CACHE_DIR}/[0-9a-f]{40}/test"

  # overwrite donwload function to fail
  function download_file () {
    exit 1
  }

  run get_from_url "${file}"
  assert_success
  assert_output --regexp "${BUILDPACK_CACHE_DIR}/[0-9a-f]{40}/buildpack\.tar\.xz"

  run get_from_url "${file}" "test"
  assert_success
  assert_output --regexp "${BUILDPACK_CACHE_DIR}/[0-9a-f]{40}/test"
}

@test "cache_folder" {
    # set up the cache
  load "$TEST_DIR/cache.sh"
  BUILDPACK_CACHE_DIR="$(create_temp_dir TEST_CACHE_DIR)"

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
  assert_output --regexp "^${BUILDPACK_CACHE_DIR}/${key_checksum}/folder\.tar"

  run cache_folder "${tool_folder}"
  assert_success
  assert_output --regexp "^${BUILDPACK_CACHE_DIR}/${path_checksum}/folder\.tar"

  # delete cache entry
  rm -rf ${BUILDPACK_CACHE_DIR}/${key_checksum}
  rm -rf ${BUILDPACK_CACHE_DIR}/${path_checksum}
}

@test "restore_folder_from_cache" {
  # set up the cache
  load "$TEST_DIR/cache.sh"
  BUILDPACK_CACHE_DIR="$(create_temp_dir TEST_CACHE_DIR)"

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
  assert_output --regexp "^${BUILDPACK_CACHE_DIR}/${key_checksum}/folder\.tar"

  run cache_folder "${tool_folder}"
  assert_success
  assert_output --regexp "^${BUILDPACK_CACHE_DIR}/${path_checksum}/folder\.tar"

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
  rm -rf ${BUILDPACK_CACHE_DIR}/${key_checksum}
  rm -rf ${BUILDPACK_CACHE_DIR}/${path_checksum}
}
