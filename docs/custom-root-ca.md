# Custom Root CA Certificates

Most tools support two ways to extend the default Root CA certificates list.

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
For NodeJS `NODE_EXTRA_CA_CERTS` is required.

```bash
docker run --rm -it \
  -v my-root-ca.crt:/my-root-ca.crt \
  -e SSL_CERT_FILE=/my-root-ca.crt \
  -e NODE_EXTRA_CA_CERTS=/my-root-ca.crt \
  containerbase/buildpack bash
```
