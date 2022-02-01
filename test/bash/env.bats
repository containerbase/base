setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

  TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"
  TEST_ROOT_DIR=$(mktemp -u)

  USER_NAME=user
  USER_ID=1000

  load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "can set and get a version" {
  local install_dir=$(get_install_dir)

  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_directories
  run set_tool_version

  assert [ -f "${install_dir}/versions/foo" ]

  run get_tool_version foo
  assert_output "1.2.3"

  run get_tool_version
  assert_output "1.2.3"
}

@test "handles setting and getting the tool env correct" {
  local install_dir=$(get_install_dir)
  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_directories

  TOOL_NAME= run export_tool_env
  assert_failure

  export_tool_env FOO_HOME 123
  assert [ "${FOO_HOME}" = "123" ]
  run cat "${install_dir}/env.d/foo.sh"
  assert_success
  assert_output --partial "FOO_HOME=\${FOO_HOME-123}"

  run reset_tool_env
  assert_success

  run cat "${install_dir}/env.d/foo.sh"
  assert_failure
}

@test "handles complex setting and getting the tool env correctly" {
  local install_dir=$(get_install_dir)
  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_environment
  assert_success

  # check that the env file is available
  assert [ -f "${TEST_ROOT_DIR}/usr/local/etc/env" ]

  run setup_directories

  TOOL_NAME= run export_tool_env
  assert_failure

  export_tool_env FOO_HOME 123
  assert [ "${FOO_HOME}" = "123" ]
  run cat "${install_dir}/env.d/foo.sh"
  assert_success
  assert_output --partial "FOO_HOME=\${FOO_HOME-123}"

  unset FOO_HOME
  assert [ -z "${FOO_HOME}" ]
  assert [ -n "${TEST_ROOT_DIR}" ]
  assert [ -n "${ENV_FILE}" ]

  . "${TEST_ROOT_DIR}/usr/local/etc/env"
  assert [ "${FOO_HOME}" = "123" ]

  unset FOO_HOME

  BASH_ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  run bash -c 'env | grep FOO'
  assert_success
  assert_output --partial FOO_HOME=123

  unset FOO_HOME

  BASH_ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  run bash -c "sh -c 'env | grep FOO'"
  assert_success
  assert_output --partial FOO_HOME=123
}

@test "handles complex setting and getting the tool path correctly" {
  local install_dir=$(get_install_dir)
  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  run setup_environment
  assert_success

  run setup_directories
  assert_success

  local old_path=$PATH

  TOOL_NAME= run export_tool_path
  assert_failure

  export_tool_path /foo
  assert echo "${PATH}" | grep "/foo:"
  export PATH=$old_path

  export_tool_path /foo true
  assert echo "${PATH}" | grep ":/foo"
  export PATH=$old_path

  BASH_ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  run bash -c 'env | grep PATH'
  assert_success
  assert_output --partial /foo:
  export PATH=$old_path

  BASH_ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  run bash -c 'sh -c "env | grep PATH"'
  assert_success
  assert_output --partial /foo:
  export PATH=$old_path

  BASH_ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  run bash -c 'env | grep PATH'
  assert_success
  assert_output --partial :/foo
  export PATH=$old_path

  BASH_ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  ENV="${TEST_ROOT_DIR}/usr/local/etc/env" \
  run bash -c 'sh -c "env | grep PATH"'
  assert_success
  assert_output --partial :/foo
  export PATH=$old_path
}
