FROM ghcr.io/containerbase/devcontainer:13.25.1

USER root

# install required packages for testing 
RUN set -x; \
  install-apt \
    lsb-release \
    ;

USER $USER_NAME
