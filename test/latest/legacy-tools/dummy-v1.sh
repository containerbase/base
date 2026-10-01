#!/bin/bash

# v1 shell tool like custom images ship them, sourced by `v1-install-tool.sh`
# installs a small script which prints its name and version

require_root

versioned_tool_path=$(create_versioned_tool_path)
create_folder "${versioned_tool_path}/bin"
printf '#!/bin/bash\necho "%s %s"\n' "${TOOL_NAME}" "${TOOL_VERSION}" > "${versioned_tool_path}/bin/${TOOL_NAME}"
chmod +x "${versioned_tool_path}/bin/${TOOL_NAME}"

shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"

[[ -n $SKIP_VERSION ]] || dummy-v1 --version
