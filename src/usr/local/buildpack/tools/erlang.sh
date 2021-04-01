#!/bin/bash

set -e

require_root
curl -sSL https://packages.erlang-solutions.com/erlang-solutions_2.0_all.deb -o erlang.deb
dpkg -i erlang.deb
rm -f erlang.deb

apt_install esl-erlang=1:${TOOL_VERSION}*


erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().'  -noshell
