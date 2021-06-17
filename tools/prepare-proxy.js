import shell from 'shelljs';

shell.echo(`Preparing squid-deb-proxy`);

shell.exec('apt-get install -y squid-deb-proxy');
shell
  .cat('./tools/buildpack.acl')
  .to('/etc/squid-deb-proxy/mirror-dstdomain.acl.d/buildpack.acl');
shell.exec('systemctl reload squid-deb-proxy');
