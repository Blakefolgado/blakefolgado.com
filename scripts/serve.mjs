import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { loadEnvFile } from 'node:process';
import tide from '../server/tide.js';

try { loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
  await mkdir('.local', { recursive: true });
  process.env.GARDEN_LOCAL_FILE = resolve('.local/tide.json');
  console.log('Shared shore: local disk only. Cloud storage is not connected.');
}
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  if (req.url?.split('?')[0] === '/api/tide') return tide(req, res);
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const file = path === root ? resolve(root, 'index.html') : path;
    const content = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(content);
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 400).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Pixel garden: http://localhost:4173'));
