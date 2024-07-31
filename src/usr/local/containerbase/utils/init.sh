#!/bin/bash

function init_v2_tool () {

  if [[ -f "$(get_tool_init)" ]]; then
    # tool already initialized
    return
  fi

  # ensure tool path exists
  create_tool_path > /dev/null

  # init tool
  init_tool

  set_tool_init
}
