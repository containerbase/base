# Custom Root CA Certificates

Most tools support two ways to extend the default Root CA certificates list.

If you are using a custom base image, checkout [Custom base image](./custom-base-image.md) docs.

## Buildtime install

This is the easiest method.

```Dockerfile
FROM containerbase/buildpack

COPY my-root-ca.crt /usr/local/share/ca-certificates/my-root-ca.crt
RUN update-ca-certificates

# configure node
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/my-root-ca.crt
```

### Java

Buildpack will create a central certificate store at `/opt/buildpack/ssl/cacerts` when preparing Java (`prepare-tool java`).
This will be used by all Java versions installed by our `install-tool`.
So you can copy your own store like this:

```Dockerfile
FROM containerbase/buildpack

COPY my-root-cert-store.jks /opt/buildpack/ssl/cacerts

RUN install-tool java <version>
```

## Runtime install

Most OpenSSL base tools (and maybe BoringSSL) support `SSL_CERT_FILE` environment for additional custom root ca files.

```bash
docker run --rm -it \
  -v my-root-ca.crt:/my-root-ca.crt \
  -e SSL_CERT_FILE=/my-root-ca.crt \
  -e NODE_EXTRA_CA_CERTS=/my-root-ca.crt \
  containerbase/buildpack bash
```

### Java

For Java you need to mount your own certificate store to `/opt/buildpack/ssl/cacerts`.

```bash
docker run --rm -it \
  -v my-root-ca.crt:/my-root-ca.crt \
  -v my-root-cert-store.jks:/opt/buildpack/ssl/cacerts \
  -e SSL_CERT_FILE=/my-root-ca.crt \
  -e NODE_EXTRA_CA_CERTS=/my-root-ca.crt \
  containerbase/buildpack bash
```
