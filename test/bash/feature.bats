
setup() {
  load '../../node_modules/bats-support/load'
  load '../../node_modules/bats-assert/load'

  TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"

  TEST_ROOT_DIR=$(mktemp -u)
  USER_HOME=$TEST_ROOT_DIR

  load "$TEST_DIR/../../src/usr/local/buildpack/util.sh"
}

teardown() {
  rm -rf "${TEST_ROOT_DIR}"
}

@test "features can be set, queried and removed" {
  run set_feature_flag
  assert_failure

  run set_feature_flag ""
  assert_failure

  run set_feature_flag "foo-bar"
  assert_success

  run set_feature_flag "foo bar"
  assert_failure

  set_feature_flag "${FEATURE_V2_TOOL}"
  assert [ -n "${ACTIVE_FEATURES}" ]
  assert [ "${ACTIVE_FEATURES}" = "${FEATURE_V2_TOOL}" ]

  set_feature_flag "foo-bar"
  assert [ -n "${ACTIVE_FEATURES}" ]
  assert [ "${ACTIVE_FEATURES}" = "${FEATURE_V2_TOOL} foo-bar" ]

  run is_feature_set "foo-bar"
  assert_output "0"

  run is_feature_set "${FEATURE_V2_TOOL}"
  assert_output "0"

  run is_feature_set "bar"
  assert_output "1"

  run is_feature_set "${V2_TOOL} foo-bar"
  assert_output "1"

  unset_feature_flag "${FEATURE_V2_TOOL}"
  assert [ -n "${ACTIVE_FEATURES}" ]
  assert [ "${ACTIVE_FEATURES}" = "foo-bar" ]

  unset_feature_flag "foo-bar"
  assert [ -z "${ACTIVE_FEATURES}" ]
}
