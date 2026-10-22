import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.mp3': 'audio/mpeg'};

export function createStaticServer() {
  return createServer(async (request, response) => {
    const fail = status => { response.writeHead(status); response.end(); };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD'); fail(405); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.includes('\0') || pathname.includes('\\')) { fail(400); return; }
      const root = await realpath(publicRoot);
      const file = await realpath(path.join(root, pathname === '/' ? 'index.html' : pathname));
      if (!file.startsWith(root + path.sep)) { fail(403); return; }
      const info = await stat(file);
      if (!info.isFile()) { fail(404); return; }
      const headers = {'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes'};
      let start = 0, end = info.size - 1, status = 200;
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!range || (!range[1] && !range[2])) { fail(416); return; }
        start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
        end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
        if (start > end || start >= info.size) {
          response.setHeader('Content-Range', `bytes */${info.size}`); fail(416); return;
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`; status = 206;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      response.writeHead(status, headers);
      if (request.method === 'HEAD' || info.size === 0) { response.end(); return; }
      const stream = createReadStream(file, {start, end});
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) { fail(error instanceof URIError ? 400 : 404); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8091);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido.');
  const server = createStaticServer();
  server.on('error', error => { console.error('No se pudo iniciar UMBRAL:', error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`UMBRAL · http://127.0.0.1:${port} · Ctrl+C para salir`));
}
