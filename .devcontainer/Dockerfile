FROM ghcr.io/containerbase/devcontainer:14.30.0

USER root

# install required packages for testing 
RUN set -x; \
  install-apt \
    lsb-release \
    ;

USER $USER_NAME
