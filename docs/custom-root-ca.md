# Custom Root CA Certificates

Most tools support two ways to extend the default Root CA certificates list.

If you are using a custom base image, checkout [Custom base image](./custom-base-image.md) docs.

## Notes

1. Ensure your custom certs are RFC 5280[^1] compliant.
   Especially Python v3.13.0 will reject non-compliant certs.

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

Most OpenSSL based tools (and maybe BoringSSL) support `SSL_CERT_FILE` environment for additional custom root ca files.
Some tools ignore `SSL_CERT_FILE` and need their own environment variable:

| Tool           | Environment variable      |
| -------------- | ------------------------- |
| git            | `GIT_SSL_CAINFO`          |
| Node.js or Bun | `NODE_EXTRA_CA_CERTS`[^2] |

git uses libcurl, which always loads `/etc/ssl/certs/ca-certificates.crt` and doesn't read `SSL_CERT_FILE`.
`GIT_SSL_CAINFO` replaces that file, the other certificates in `/etc/ssl/certs` are still used.

```bash
docker run --rm -it \
  -v my-root-ca.crt:/my-root-ca.crt \
  -e SSL_CERT_FILE=/my-root-ca.crt \
  -e GIT_SSL_CAINFO=/my-root-ca.crt \
  -e NODE_EXTRA_CA_CERTS=/my-root-ca.crt \
  containerbase/base bash
```

Don't mount your certificates over `/etc/ssl/certs`, this hides the default certificates and git fails with `error setting certificate file: /etc/ssl/certs/ca-certificates.crt`.

### Runtime Java install

For Java you need to mount your own certificate store to `/opt/containerbase/ssl/cacerts`.

```bash
docker run --rm -it \
  -v my-root-ca.crt:/my-root-ca.crt \
  -v my-root-cert-store.jks:/opt/containerbase/ssl/cacerts \
  -e SSL_CERT_FILE=/my-root-ca.crt \
  containerbase/base bash
```

[^1]: <https://datatracker.ietf.org/doc/html/rfc5280>

[^2]: <https://github.com/oven-sh/bun/issues/271>
