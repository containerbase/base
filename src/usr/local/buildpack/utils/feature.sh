#!/bin/bash

# Simple feature flag implementation,
# active features are stored in ACTIVE_FEATURES

# Feature names
export FEATURE_V2_TOOL="feature-v2-tool"

# Sets the given feature flag name to true
function set_feature_flag () {
  local name=${1}
  check name true

  if [[ $name = *" "* ]]; then
    echo "feature flag name should not contain spaces"
    exit 1
  fi
  if [ "$(is_feature_set "${name}")" -eq 1 ]; then
    IFS=' ' read -r -a features <<< "${ACTIVE_FEATURES}"
    features+=("${name}")
    # shellcheck disable=SC2155
    export ACTIVE_FEATURES=$( IFS=' '; printf '%s' "${features[*]}" | xargs )
  fi
}

# Sets the given feature flag name to false
function unset_feature_flag () {
  local name=${1}
  check name true

  if [[ $name = *" "* ]]; then
    echo "feature flag name should not contain spaces"
    exit 1
  fi
  if [ "$(is_feature_set "${name}")" -eq 0 ]; then
    IFS=' ' read -r -a features <<< "${ACTIVE_FEATURES}"
    features=( "${features[@]/$name}" )
    # shellcheck disable=SC2155
    export ACTIVE_FEATURES=$( IFS=' '; printf '%s' "${features[*]}" | xargs )
  fi
}

# Checks if the feature given by the feature flag name is set to true
function is_feature_set () {
  local name=${1}
  check name true

  # shellcheck disable=SC2076
  if [[ " ${ACTIVE_FEATURES[*]} " =~ " ${name} " ]]; then
    echo 0
  else
    echo 1
  fi
}
