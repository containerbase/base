#!/bin/bash

# This file contains all functions a tool must implement to be properly supported
# The buildpack scripts rely on the functions to decide if a tool needs to be handled in a special way
# This defaults are loaded before any tool file so not overwriting the function will
# result in the install process being aborted

# Is used to check if all requirements are met to install the tool
function check_tool_requirements () {
  echo "'check_tool_requirements' not defined for tool ${TOOL_NAME}"
  exit 1
}

# Is used to check if the tool has already been installed in the given version
function check_tool_installed () {
  echo "'check_tool_installed' not defined for tool ${TOOL_NAME}"
  exit 1
}

# Installs the tool with the given version
function install_tool () {
  echo "'install_tool' not defined for tool ${TOOL_NAME}"
  exit 1
}

# Links the tools installation to the global bin folders
function link_tool () {
  echo "'link_tool' not defined for tool ${TOOL_NAME}"
  exit 1
}

# Installs needed packages to make the tool runtime installable
function prepare_tool() {
  echo "'prepare_tool' not defined for tool ${TOOL_NAME}"
  exit 1
}
