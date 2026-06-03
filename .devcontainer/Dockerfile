FROM ghcr.io/containerbase/devcontainer:14.10.22

USER root

# install required packages for testing 
RUN set -x; \
  install-apt \
    lsb-release \
    ;

USER $USER_NAME
