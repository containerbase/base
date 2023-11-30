#!/bin/bash

function createUser() {
  # Set up user and home directory with access to users in the root group (0)
  # https://docs.openshift.com/container-platform/3.6/creating_images/guidelines.html#use-uid
  groupadd --gid "${USER_ID}" "${USER_NAME}";
  useradd --uid "${USER_ID}" --gid "${PRIMARY_GROUP_ID}" --groups "0,${USER_ID}" --shell /bin/bash --create-home "${USER_NAME}"
}
