FROM ghcr.io/containerbase/devcontainer:13.24.3

USER root

# install required packages for testing 
RUN set -x; \
  install-apt \
    lsb-release \
    ;

USER $USER_NAME
