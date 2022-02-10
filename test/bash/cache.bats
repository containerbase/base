
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

  # create cache dir
  BUILDPACK_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${BUILDPACK_CACHE_DIR}"

  # create files
  touch "${BUILDPACK_CACHE_DIR}/c"
  sleep 0.01
  touch "${BUILDPACK_CACHE_DIR}/b"
  sleep 0.01
  touch "${BUILDPACK_CACHE_DIR}/a"

  BUILDPACK_CACHE_DIR= \
  BUILDPACK_CACHE_MAX_ALLOCATED_DISK= \
  run cleanup_cache
  assert_failure

  BUILDPACK_CACHE_DIR= \
  BUILDPACK_CACHE_MAX_ALLOCATED_DISK=20 \
  run cleanup_cache
  assert_failure

  BUILDPACK_CACHE_MAX_ALLOCATED_DISK= \
  run cleanup_cache
  assert_success
  assert [ -e "${BUILDPACK_CACHE_DIR}/a" ]
  assert [ -e "${BUILDPACK_CACHE_DIR}/b" ]
  assert [ -e "${BUILDPACK_CACHE_DIR}/c" ]

  run cleanup_cache true
  assert_success
  assert [ -e "${BUILDPACK_CACHE_DIR}/a" ]
  assert [ -e "${BUILDPACK_CACHE_DIR}/b" ]
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/c" ]

  TEST_FILL_LEVEL=30 \
  run cleanup_cache
  assert_success
  assert [ -e "${BUILDPACK_CACHE_DIR}/a" ]
  assert [ -e "${BUILDPACK_CACHE_DIR}/b" ]
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/c" ]

  TEST_FILL_LEVEL=90 \
  run cleanup_cache
  assert_success
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/a" ]
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/b" ]
  assert [ ! -e "${BUILDPACK_CACHE_DIR}/c" ]
}

@test "download_file" {
  # create cache dir
  BUILDPACK_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${BUILDPACK_CACHE_DIR}"

  local file="https://file-examples-com.github.io/uploads/2017/02/file_example_JSON_1kb.json"

  run download_file
  assert_failure

  run download_file "${file}"
  assert_success
  assert_output "${BUILDPACK_CACHE_DIR}/file_example_JSON_1kb.json"

  run download_file "${file}" "foobar"
  assert_success
  assert_output "${BUILDPACK_CACHE_DIR}/foobar"

  BUILDPACK_CACHE_DIR= \
  tmp_file=$(download_file "${file}")
  rm "${tmp_file}"

  assert test "[[ "${tmp_file}" =~ "\/file_example_JSON_1kb.json" ]]"
}

@test "get_from_url" {
  # create cache dir
  BUILDPACK_CACHE_DIR="${TEST_ROOT_DIR}/cache"
  mkdir -p "${BUILDPACK_CACHE_DIR}"

  local file="https://file-examples-com.github.io/uploads/2017/02/file_example_JSON_1kb.json"

  run get_from_url "${file}"
  assert_success
  assert_output "${BUILDPACK_CACHE_DIR}/file_example_JSON_1kb.json"

  run get_from_url "${file}" test
  assert_success
  assert_output "${BUILDPACK_CACHE_DIR}/test"

  # overwrite donwload function to fail
  function download_file () {
    exit 1
  }

  run get_from_url "${file}"
  assert_success
  assert test '[[ $output == "${BUILDPACK_CACHE_DIR}/file_example_JSON_1kb.json" ]]'
  assert test '[[ $stderr == "Found file in cache: ${BUILDPACK_CACHE_DIR}/file_example_JSON_1kb.json" ]]'

  run get_from_url "${file}" "test"
  assert_success
  assert test '[[ $output == "${BUILDPACK_CACHE_DIR}/test" ]]'
  assert test '[[ $stderr == "Found file in cache: ${BUILDPACK_CACHE_DIR}/test" ]]'
}
