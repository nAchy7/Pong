import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/engine.mjs', ['engine.mjs', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = new URL(request.url, 'http://localhost').pathname;
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  const asset = assets.get(pathname);
  if (!asset) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Nenalezeno');
    return;
  }
  try {
    const data = await readFile(new URL(asset[0], import.meta.url));
    response.writeHead(200, {
      'Content-Type': asset[1],
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error(`Cannot serve ${asset[0]}: ${error.message}`);
    response.writeHead(500);
    response.end('Chyba serveru');
  }
});

server.listen(port, host, () => console.log(`Pong běží na portu ${port}.`));
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close());
}
