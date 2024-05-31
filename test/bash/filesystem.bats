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

@test "gets the default install dir" {
    TEST_ROOT_USER=1000 \
    run get_install_dir
    assert_output "${TEST_ROOT_DIR}/user"

    TEST_ROOT_USER=0 \
    run get_install_dir
    assert_output "${TEST_ROOT_DIR}/root"
}

@test "can create a versioned tool path as user" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run create_versioned_tool_path

    assert_output "${TEST_ROOT_DIR}/user/foo/1.2.3"
    assert [ -d "${TEST_ROOT_DIR}/user/foo/1.2.3" ]
    assert [ "$(stat --format '%a' "${TEST_ROOT_DIR}/user/foo")" -eq 775 ]
    assert [ "$(stat --format '%a' "${TEST_ROOT_DIR}/user/foo/1.2.3")" -eq 775 ]
}

@test "can create a versioned tool path as root" {
    local TEST_ROOT_USER=0

    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run create_versioned_tool_path

    assert_output "${TEST_ROOT_DIR}/root/foo/1.2.3"
    assert [ -d "${TEST_ROOT_DIR}/root/foo/1.2.3" ]
    assert [ "$(stat --format '%a' "${TEST_ROOT_DIR}/root/foo")" -eq 755 ]
    assert [ "$(stat --format '%a' "${TEST_ROOT_DIR}/root/foo/1.2.3")" -eq 755 ]
}

@test "finds the versioned tool path" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run find_versioned_tool_path
    assert_output ""

    # user
    run create_versioned_tool_path
    run find_versioned_tool_path
    assert_output "${TEST_ROOT_DIR}/user/foo/1.2.3"

    # root
    local TEST_ROOT_USER=0
    run create_versioned_tool_path
    run find_versioned_tool_path
    assert_output "${TEST_ROOT_DIR}/root/foo/1.2.3"

}

@test "finds the tool path" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    run find_tool_path
    assert_success
    assert_output ""

    # user
    mkdir -p "${TEST_ROOT_DIR}/user/foo"
    run find_tool_path
    assert_success
    assert_output "${TEST_ROOT_DIR}/user/foo"

    # root
    local TEST_ROOT_USER=0
    mkdir -p "${TEST_ROOT_DIR}/root/foo"
    run find_tool_path
    assert_success
    assert_output "${TEST_ROOT_DIR}/root/foo"
}

@test "finds the tool env path" {
    local TOOL_NAME=foo
    local TOOL_VERSION=1.2.3

    # user
    run find_tool_env
    assert_output "${TEST_ROOT_DIR}/user/env.d/foo.sh"

    # root
    local TEST_ROOT_USER=0
    run find_tool_env
    assert_output "${TEST_ROOT_DIR}/root/env.d/foo.sh"

    TOOL_NAME='' run find_tool_env
    assert_failure
}

@test "setup directories with correct permissions" {
  local TEST_ROOT_USER=0 # root
  local install_dir=$(get_install_dir)

  run setup_directories
  assert_success

  assert [ -d "${install_dir}/tools" ]
  assert [ "$(stat --format '%a' "${install_dir}/tools")" -eq 775 ]
  assert [ -d "${install_dir}/versions" ]
  assert [ "$(stat --format '%a' "${install_dir}/versions")" -eq 775 ]
  assert [ -d "${install_dir}/bin" ]
  assert [ "$(stat --format '%a' "${install_dir}/bin")" -eq 775 ]
  assert [ -d "${BIN_DIR}" ]
  assert [ -L "${BIN_DIR}" ]
  assert [ "$(stat --format '%a' "${BIN_DIR}")" -eq 777 ]
  assert [ -d "${install_dir}/env.d" ]
  assert [ "$(stat --format '%a' "${install_dir}/env.d")" -eq 775 ]
  assert [ -d "${install_dir}/cache" ]
  assert [ "$(stat --format '%a' "${install_dir}/cache")" -eq 775 ]
  assert [ -d "${install_dir}/home" ]
  assert [ "$(stat --format '%a' "${install_dir}/home")" -eq 775 ]
}

@test "creates a folder with correct permissions" {
  local install_dir=$(get_install_dir)

  run create_folder
  assert_failure

  TEST_ROOT_USER=1000
  run create_folder "${install_dir}/foo"
  assert_success

  assert [ -d "${install_dir}/foo" ]
  assert [ "$(stat --format '%a' "${install_dir}/foo")" -eq "${USER_UMASK}" ]

  run create_folder "${install_dir}/foo2" 777
  assert_success

  assert [ -d "${install_dir}/foo2" ]
  assert [ "$(stat --format '%a' "${install_dir}/foo2")" -eq "777" ]

  TEST_ROOT_USER=0
  run create_folder "${install_dir}/bar"
  assert_success

  assert [ -d "${install_dir}/bar" ]
  assert [ "$(stat --format '%a' "${install_dir}/bar")" -eq "${ROOT_UMASK}" ]

  run create_folder "${install_dir}/bar2" 777
  assert_success

  assert [ -d "${install_dir}/bar2" ]
  assert [ "$(stat --format '%a' "${install_dir}/bar2")" -eq "777" ]
}

@test "creates deep folder with correct permissions" {
  local install_dir=$(get_install_dir)

  TEST_ROOT_USER=1000
  run create_folder "${install_dir}/test/foo/bar/baz"

  assert [ -d "${install_dir}/test" ]
  assert [ "$(stat --format '%a' "${install_dir}/test")" -eq "${USER_UMASK}" ]
  assert [ -d "${install_dir}/test/foo" ]
  assert [ "$(stat --format '%a' "${install_dir}/test/foo")" -eq "${USER_UMASK}" ]
  assert [ -d "${install_dir}/test/foo/bar" ]
  assert [ "$(stat --format '%a' "${install_dir}/test/foo/bar")" -eq "${USER_UMASK}" ]
  assert [ -d "${install_dir}/test/foo/bar/baz" ]
  assert [ "$(stat --format '%a' "${install_dir}/test/foo/bar/baz")" -eq "${USER_UMASK}" ]

  TEST_ROOT_USER=0
  run create_folder "${install_dir}/bar/foo/bar/baz"

  assert [ -d "${install_dir}/bar" ]
  assert [ "$(stat --format '%a' "${install_dir}/bar")" -eq "${ROOT_UMASK}" ]
  assert [ -d "${install_dir}/bar/foo" ]
  assert [ "$(stat --format '%a' "${install_dir}/bar/foo")" -eq "${ROOT_UMASK}" ]
  assert [ -d "${install_dir}/bar/foo/bar" ]
  assert [ "$(stat --format '%a' "${install_dir}/bar/foo/bar")" -eq "${ROOT_UMASK}" ]
  assert [ -d "${install_dir}/bar/foo/bar/baz" ]
  assert [ "$(stat --format '%a' "${install_dir}/bar/foo/bar/baz")" -eq "${ROOT_UMASK}" ]
}
