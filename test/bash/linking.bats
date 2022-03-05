
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
  assert [ -f "${USER_HOME}/bin/git" ]

  echo "#!/bin/bash\n\necho 'foobar'" > "${USER_HOME}/bin2/foobar"
  chmod +x "${USER_HOME}/bin2/foobar"

  run link_wrapper foobar "${USER_HOME}/bin2/foobar"
  assert_success
  assert [ -f "${USER_HOME}/bin/foobar" ]
  rm "${USER_HOME}/bin/foobar"

  echo "#!/bin/bash\n\necho 'foobar'" > "${USER_HOME}/bin3/foobar"
  chmod +x "${USER_HOME}/bin3/foobar"

  run link_wrapper foobar "${USER_HOME}/bin3"
  assert_success
  assert [ -f "${USER_HOME}/bin/foobar" ]

}

@test "shell_wrapper" {

  run shell_wrapper
  assert_failure
  assert_output --partial "No  defined"

  run shell_wrapper foo
  assert_failure
  assert_output --partial "No foo defined"

  # cannot test, the function is broken
  # run shell_wrapper ls
  # assert_success
  # assert_output --partial "No foo defined"
}
