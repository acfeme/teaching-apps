// 로컬 시험용 서버. 메모리 저장소를 쓰며 실제 Redis에 접속하지 않는다.
// 실행: LOCAL_DEV=1 ADMIN_PASSWORD=<시험용 값> node scripts/dev-server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.LOCAL_DEV = '1';
process.env.ADMIN_PASSWORD ||= 'local-test-only';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const handlers = {
  state: (await import('../api/state.js')).default,
  start: (await import('../api/start.js')).default,
  warn: (await import('../api/warn.js')).default,
  submit: (await import('../api/submit.js')).default,
  ranking: (await import('../api/ranking.js')).default,
  admin: (await import('../api/admin.js')).default,
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const fn = handlers[url.pathname.slice(5)];
    if (!fn) { res.writeHead(404); return res.end(); }
    let raw = '';
    for await (const c of req) raw += c;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = undefined; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return fn(req, res);
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!path.extname(p)) p += '.html';
  const file = path.join(root, 'public', path.normalize(p));
  if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  return res.end(fs.readFileSync(file));
}).listen(Number(process.env.PORT || 4173), () => console.log('ready', process.env.PORT || 4173));
