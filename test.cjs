const https = require('https');

const data = JSON.stringify({ email: 'test@test.com', password: 'password123' });

const options = {
  hostname: 'dendenair.onrender.com',
  port: 443,
  path: '/api/v1/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => { body += d; });
  res.on('end', () => { console.log(`Body: ${body}`); });
});

req.on('error', error => { console.error(error); });
req.write(data);
req.end();
