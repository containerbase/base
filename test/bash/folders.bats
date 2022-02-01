
setup() {
  load 'test_helper/bats-support/load'
  load 'test_helper/bats-assert/load'

  TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"

  TEST_ROOT_DIR=$(mktemp -u)

  load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "gets the default install dir" {
  unset TEST_ROOT_DIR
  run get_install_dir
  assert_output "/opt/buildpack"
}

@test "gets a custom install dir" {
  TEST_ROOT_DIR=/foo
  run get_install_dir
  assert_output "/foo/opt/buildpack"
}

@test "setup directories with correct permissions" {
  local install_dir=$(get_install_dir)

  run setup_directories
  assert_success

  assert [ -d "${install_dir}/tools" ]
  assert [ $(stat --format '%a' "${install_dir}/tools") -eq 770 ]
  assert [ -d "${install_dir}/versions" ]
  assert [ $(stat --format '%a' "${install_dir}/versions") -eq 770 ]
  assert [ -d "${install_dir}/bin" ]
  assert [ $(stat --format '%a' "${install_dir}/bin") -eq 770 ]
  assert [ -d "${install_dir}/env.d" ]
  assert [ $(stat --format '%a' "${install_dir}/env.d") -eq 770 ]
}

@test "creates a folder with correct permissions" {
  local install_dir=$(get_install_dir)

  run create_folder
  assert_failure

  TEST_ROOT_USER=1000
  run create_folder "${install_dir}/foo"
  assert_success

  assert [ -d "${install_dir}/foo" ]
  assert [ $(stat --format '%a' "${install_dir}/foo") -eq "${USER_UMASK}" ]

  TEST_ROOT_USER=0
  run create_folder "${install_dir}/bar"
  assert [ -d "${install_dir}/bar" ]
  assert [ $(stat --format '%a' "${install_dir}/bar") -eq "${ROOT_UMASK}" ]
}

@test "creates deep folder with correct permissions" {
  local install_dir=$(get_install_dir)

  TEST_ROOT_USER=1000
  run create_folder "${install_dir}/test/foo/bar/baz"

  assert [ -d "${install_dir}/test" ]
  assert [ $(stat --format '%a' "${install_dir}/test") -eq "${USER_UMASK}" ]
  assert [ -d "${install_dir}/test/foo" ]
  assert [ $(stat --format '%a' "${install_dir}/test/foo") -eq "${USER_UMASK}" ]
  assert [ -d "${install_dir}/test/foo/bar" ]
  assert [ $(stat --format '%a' "${install_dir}/test/foo/bar") -eq "${USER_UMASK}" ]
  assert [ -d "${install_dir}/test/foo/bar/baz" ]
  assert [ $(stat --format '%a' "${install_dir}/test/foo/bar/baz") -eq "${USER_UMASK}" ]

  TEST_ROOT_USER=0
  run create_folder "${install_dir}/bar/foo/bar/baz"

  assert [ -d "${install_dir}/bar" ]
  assert [ $(stat --format '%a' "${install_dir}/bar") -eq "${ROOT_UMASK}" ]
  assert [ -d "${install_dir}/bar/foo" ]
  assert [ $(stat --format '%a' "${install_dir}/bar/foo") -eq "${ROOT_UMASK}" ]
  assert [ -d "${install_dir}/bar/foo/bar" ]
  assert [ $(stat --format '%a' "${install_dir}/bar/foo/bar") -eq "${ROOT_UMASK}" ]
  assert [ -d "${install_dir}/bar/foo/bar/baz" ]
  assert [ $(stat --format '%a' "${install_dir}/bar/foo/bar/baz") -eq "${ROOT_UMASK}" ]
}

@test "can create a versioned tool path as root" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  local TEST_ROOT_USER=0

  run setup_directories
  run create_versioned_tool_path

  assert_output "${install_dir}/tools/foo/1.2.3"
  assert [ -d "${install_dir}/tools/foo/1.2.3" ]
  assert [ $(stat --format '%a' "${install_dir}/tools/foo") -eq "${ROOT_UMASK}" ]
  assert [ $(stat --format '%a' "${install_dir}/tools/foo/1.2.3") -eq "${ROOT_UMASK}" ]
}

@test "can create a versioned tool path as user" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  local TEST_ROOT_USER=1000

  run setup_directories
  run create_versioned_tool_path

  assert_output "${install_dir}/tools/foo/1.2.3"
  assert [ -d "${install_dir}/tools/foo/1.2.3" ]
  assert [ $(stat --format '%a' "${install_dir}/tools/foo") -eq "${USER_UMASK}" ]
  assert [ $(stat --format '%a' "${install_dir}/tools/foo/1.2.3") -eq "${USER_UMASK}" ]
}

@test "can create a tool path as root" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  local TEST_ROOT_USER=0

  run setup_directories
  run create_tool_path

  assert_output "${install_dir}/tools/foo"
  assert [ -d "${install_dir}/tools/foo" ]
  assert [ $(stat --format '%a' "${install_dir}/tools/foo") -eq "${ROOT_UMASK}" ]
}

@test "can create a tool path as user" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  local TEST_ROOT_USER=1000

  run setup_directories
  run create_tool_path

  assert_output "${install_dir}/tools/foo"
  assert [ -d "${install_dir}/tools/foo" ]
  assert [ $(stat --format '%a' "${install_dir}/tools/foo") -eq "${USER_UMASK}" ]
}

@test "finds the bin path" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_directories
  run get_bin_path

  assert_output "${install_dir}/bin"
}

@test "finds the versioned tool path" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_directories
  run find_versioned_tool_path
  assert_output ""

  run create_versioned_tool_path
  run find_versioned_tool_path
  assert_output "${install_dir}/tools/foo/1.2.3"
}

@test "finds the tool path" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_directories
  run find_tool_path
  assert_output ""

  run create_tool_path
  run find_tool_path
  assert_output "${install_dir}/tools/foo"
}

@test "finds the tool env path" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_directories

  run find_tool_env
  assert_output "${install_dir}/env.d/foo.sh"

  TOOL_NAME= run find_tool_env
  assert_failure
}
