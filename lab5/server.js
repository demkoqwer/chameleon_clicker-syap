// server.js — минимальный статический сервер для виджета (встроенные модули Node, без пакетов).
// Нужен, потому что ES-модули не загружаются по file://. Раздаёт папку lab5.
// Запуск: node server.js → http://localhost:8000/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', // для модулей тип обязателен
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let relative = normalize(urlPath).replace(/^([/\\])+/, '');
    if (relative.startsWith('..')) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    if (urlPath.endsWith('/')) relative = join(relative, 'index.html');
    const data = await readFile(join(ROOT, relative));
    res.writeHead(200, { 'Content-Type': TYPES[extname(relative)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'EACCES' ? 403 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(e.code === 'EACCES' ? 'Доступ запрещён' : 'Не найдено');
  }
}).listen(PORT, () => console.log(`Виджет: http://localhost:${PORT}/  (остановить: Ctrl+C)`));
