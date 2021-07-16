# Custom Root CA Certificates

Most tools support two ways to extend the default Root CA certificates list.

If you are using a custom base image, checkout [Custom base image](./custom-base-image.md) docs.

## Buildtime install

This is the easiest method.

```Dockerfile
FROM containerbase/buildpack

COPY my-root-ca.crt /usr/local/share/ca-certificates/my-root-ca.crt
RUN update-ca-certificates
```

**TODO**: For java based tools we need another option

## Runtime install

Most OpenSSL base tools (and maybe BoringSSL) support `SSL_CERT_FILE` environment for additional custom root ca files.
We use `NODE_OPTIONS="--use-openssl-ca"`, so NodeJS is using the same certificate options as OpenSSL.

```bash
docker run --rm -it \
  -v my-root-ca.crt:/my-root-ca.crt \
  -e SSL_CERT_FILE=/my-root-ca.crt \
  containerbase/buildpack bash
```
