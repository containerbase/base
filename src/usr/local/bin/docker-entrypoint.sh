#!/bin/bash

if [[ -f "/opt/containerbase/env" && -z "${CONTAINERBASE_ENV+x}" ]]; then
    # shellcheck source=/dev/null
  . /opt/containerbase/env
fi

exec dumb-init -- "$@"
