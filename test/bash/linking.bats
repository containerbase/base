# shellcheck disable=SC2148

setup() {
  load "$BATS_SUPPORT_LOAD_PATH"
  load "$BATS_ASSERT_LOAD_PATH"

    TEST_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" >/dev/null 2>&1 && pwd)"
    TEST_ROOT_DIR=$(mktemp -u)

    load "$TEST_DIR/../../src/usr/local/containerbase/util.sh"

    # load test overwrites
    load "$TEST_DIR/util.sh"

    mkdir "${ROOT_DIR}/bin"

    setup_directories
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "link_wrapper" {

  mkdir -p "${USER_HOME}/bin"
  mkdir -p "${USER_HOME}/bin2"
  mkdir -p "${USER_HOME}/bin3"

  run link_wrapper
  assert_failure

  run link_wrapper foo
  assert_failure

  run link_wrapper git
  assert_success
  assert [ -f "${BIN_DIR}/git" ]

  printf "#!/bin/bash\n\necho 'foobar'" > "${USER_HOME}/bin2/foobar"
  chmod +x "${USER_HOME}/bin2/foobar"

  run link_wrapper foobar "${USER_HOME}/bin2/foobar"
  assert_success
  assert [ -f "${BIN_DIR}/foobar" ]
  rm "${BIN_DIR}/foobar"

  printf "#!/bin/bash\n\necho 'foobar'" > "${USER_HOME}/bin3/foobar"
  chmod +x "${USER_HOME}/bin3/foobar"

  run link_wrapper foobar "${USER_HOME}/bin3"
  assert_success
  assert [ -f "${BIN_DIR}/foobar" ]

}

@test "shell_wrapper" {

  mkdir -p "${USER_HOME}/bin"
  printf "#!/bin/bash\n\necho 'foobar'" > "${USER_HOME}/bin/foobar"
  chmod +x "${USER_HOME}/bin/foobar"

  run shell_wrapper
  assert_failure
  assert_output --partial "param SOURCE is set but empty"

  run shell_wrapper foo
  assert_failure
  assert_output --partial "param SOURCE is set but empty"

  run shell_wrapper ls
  assert_success
  assert [ -f "${BIN_DIR}/ls" ]
  assert [ "$(stat --format '%a' "${BIN_DIR}/ls")" -eq 775 ]

  PATH="${USER_HOME}/bin":$PATH run shell_wrapper foobar
  assert_success
  assert [ -f "${BIN_DIR}/foobar" ]
  assert [ "$(stat --format '%a' "${BIN_DIR}/ls")" -eq 775 ]
}
