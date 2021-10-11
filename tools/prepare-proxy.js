import shell from 'shelljs';

shell.config.fatal = true;

shell.echo(`Preparing squid-deb-proxy`);

shell.exec('apt-get -qq update');
shell.exec('apt-get install -y squid-deb-proxy');
shell
  .cat('./tools/buildpack.acl')
  .to('/etc/squid-deb-proxy/mirror-dstdomain.acl.d/buildpack.acl');
shell.exec('systemctl reload squid-deb-proxy');
