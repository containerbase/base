FROM ghcr.io/containerbase/devcontainer:14.12.13

USER root

# install required packages for testing 
RUN set -x; \
  install-apt \
    lsb-release \
    ;

USER $USER_NAME
