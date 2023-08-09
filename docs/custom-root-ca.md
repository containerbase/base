# Custom Root CA Certificates

Most tools support two ways to extend the default Root CA certificates list.

If you are using a custom base image, checkout [Custom base image](./custom-base-image.md) docs.

## Buildtime install

This is the easiest method.

```Dockerfile
FROM containerbase/base

COPY my-root-ca.crt /usr/local/share/ca-certificates/my-root-ca.crt
RUN update-ca-certificates
```

### Buildtime Java install

Containerbase will create a central certificate store at `/opt/containerbase/ssl/cacerts` when preparing Java (`prepare-tool java`).
This will be used by all Java versions installed by our `install-tool`.
So you can copy your own store like this:

```Dockerfile
FROM containerbase/base

COPY my-root-cert-store.jks /opt/containerbase/ssl/cacerts

RUN install-tool java <version>
```

## Runtime install

Most OpenSSL base tools (and maybe BoringSSL) support `SSL_CERT_FILE` environment for additional custom root ca files.

```bash
docker run --rm -it \
  -v my-root-ca.crt:/my-root-ca.crt \
  -e SSL_CERT_FILE=/my-root-ca.crt \
  containerbase/base bash
```

### Runtime Java install

For Java you need to mount your own certificate store to `/opt/containerbase/ssl/cacerts`.

```bash
docker run --rm -it \
  -v my-root-ca.crt:/my-root-ca.crt \
  -v my-root-cert-store.jks:/opt/containerbase/ssl/cacerts \
  -e SSL_CERT_FILE=/my-root-ca.crt \
  containerbase/base bash
```
