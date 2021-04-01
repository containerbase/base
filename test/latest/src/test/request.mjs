import https from 'https';

const options = {
  hostname: 'localhost',
  port: 443,
  path: '/',
  method: 'GET',
};

const req = https.request(options);

req.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

req.end();
