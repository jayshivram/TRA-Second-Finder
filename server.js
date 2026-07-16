const http = require('http');
const fs = require('fs');
const path = require('path');
const traVerify = require('./api/tra-verify.js');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=UTF-8',
  '.js':   'text/javascript; charset=UTF-8',
  '.css':  'text/css; charset=UTF-8',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // Route the proxy function exactly as Vercel would.
  if (urlPath === '/api/tra-verify') {
    return traVerify(req, res);
  }

  // Serve static files from this folder (just index.html for this project).
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.join(__dirname, filePath);

  // Don't allow escaping this folder via ../ tricks.
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`TRA Second Finder running at http://localhost:${PORT}`);
});
