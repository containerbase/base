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
  BASH_RC="${TEST_ROOT_DIR}/bash.bashrc"

  # set default test user
  TEST_ROOT_USER=1000
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "handles setting and getting the tool env correctly" {
  local install_dir=$(get_install_dir)
  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  mkdir -p "${TEST_ROOT_DIR}/user/env.d"

  TOOL_NAME= run export_tool_env
  assert_failure

  export_tool_env FOO_HOME 123
  assert [ "${FOO_HOME}" = "123" ]
  run cat "${install_dir}/env.d/foo.sh"
  assert_success
  assert_output --partial "FOO_HOME=\${FOO_HOME-123}"
  assert [ $(stat --format '%a' "${install_dir}/env.d/foo.sh") -eq 664 ]

  run reset_tool_env
  assert_success

  run cat "${install_dir}/env.d/foo.sh"
  assert_failure
}

@test "handles complex setting and getting the tool env correctly" {
  local install_dir=$(get_install_dir)
  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  mkdir -p "${TEST_ROOT_DIR}/user/env.d"

  setup_env_files

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

  . "${ENV_FILE}"
  assert [ "${FOO_HOME}" = "123" ]

  unset FOO_HOME

  BASH_ENV="${ENV_FILE}" \
  ENV="${ENV_FILE}" \
  run bash -c 'env | grep FOO'
  assert_success
  assert_output --partial FOO_HOME=123

  unset FOO_HOME

  BASH_ENV="${ENV_FILE}" \
  ENV="${ENV_FILE}" \
  run bash -c "sh -c 'env | grep FOO'"
  assert_success
  assert_output --partial FOO_HOME=123
}

@test "handles complex setting and getting the tool path correctly" {
  local install_dir=$(get_install_dir)
  local TOOL_NAME=foo
  local TOOL_VERSION=1.2.3

  mkdir -p "${TEST_ROOT_DIR}/user/env.d"
  setup_env_files

  local old_path=$PATH

  TOOL_NAME= run export_tool_path
  assert_failure

  export_tool_path /foo
  assert echo "${PATH}" | grep "/foo:"

  export_tool_path /foo true
  assert echo "${PATH}" | grep ":/foo"
  export PATH=$old_path

  BASH_ENV="${ENV_FILE}" \
    ENV="${ENV_FILE}" \
    run bash -c 'env | grep PATH'
  assert_success
  assert_output --partial "/foo:"

  BASH_ENV="${ENV_FILE}" \
    ENV="${ENV_FILE}" \
    run bash -c 'sh -c "env | grep PATH"'
  assert_success
  assert_output --partial "/foo:"

  BASH_ENV="${ENV_FILE}" \
  ENV="${ENV_FILE}" \
  run bash -c 'env | grep PATH'
  assert_success
  assert_output --partial ":/foo"
  export PATH=$old_path

  BASH_ENV="${ENV_FILE}" \
  ENV="${ENV_FILE}" \
  run bash -c 'sh -c "env | grep PATH"'
  assert_success
  assert_output --partial ":/foo"

  export PATH=$old_path
}
