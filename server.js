const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'cambio2026';
const DATA_FILE = path.join(__dirname, 'data', 'closures.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const PARTNERS = [
  { name: 'Francisco', contribution: 19136 },
  { name: 'Jose', contribution: 19136 },
  { name: 'Manuel', contribution: 19136 },
  { name: 'Cura', contribution: 12577.48 }
];

const sseClients = new Set();

function readClosures() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeClosures(closures) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(closures, null, 2));
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function formatWeek(date) {
  return new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calcSummary(closures) {
  const sorted = [...closures].sort((a, b) => new Date(a.date) - new Date(b.date));
  const last = sorted[sorted.length - 1];
  const totalContributions = PARTNERS.reduce((acc, p) => acc + p.contribution, 0);
  const totalProfit = last.capital - totalContributions;
  const roi = (totalProfit / totalContributions) * 100;
  const periodProfit = sorted.length > 1 ? last.capital - sorted[sorted.length - 2].capital : 0;

  return {
    totalContributions,
    currentCapital: last.capital,
    totalProfit,
    roi,
    periodProfit,
    lastCutoff: formatWeek(last.date),
    cuts: sorted.length
  };
}

function broadcast(event, payload) {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    client.write(body);
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  const filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) return false;

  const ext = path.extname(filePath);
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8'
  };

  res.writeHead(200, { 'Content-Type': map[ext] || 'text/plain; charset=utf-8' });
  res.end(fs.readFileSync(filePath));
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/partners') {
    const total = PARTNERS.reduce((acc, p) => acc + p.contribution, 0);
    return json(res, 200, PARTNERS.map((p) => ({ ...p, share: (p.contribution / total) * 100 })));
  }

  if (req.method === 'GET' && pathname === '/api/closures') {
    const closures = readClosures().sort((a, b) => new Date(a.date) - new Date(b.date));
    const enriched = closures.map((item, idx, arr) => {
      const prev = idx > 0 ? arr[idx - 1] : null;
      const periodProfit = prev ? item.capital - prev.capital : 0;
      const periodVar = prev ? (periodProfit / prev.capital) * 100 : 0;
      return { ...item, periodProfit, periodVar };
    });
    return json(res, 200, enriched);
  }

  if (req.method === 'GET' && pathname === '/api/summary') {
    return json(res, 200, calcSummary(readClosures()));
  }

  if (req.method === 'GET' && pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('event: connected\ndata: {"ok":true}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/closures') {
    if (req.headers['x-app-password'] !== APP_PASSWORD) return json(res, 401, { error: 'No autorizado' });

    try {
      const { date, capital, gross, expenses, investments, usdtProfit, debt } = await parseBody(req);
      if (!date || [capital, gross, expenses, investments, usdtProfit, debt].some((v) => typeof v !== 'number')) {
        return json(res, 400, { error: 'Datos inválidos' });
      }

      const closures = readClosures();
      if (closures.find((row) => row.date === date)) return json(res, 409, { error: 'Ya existe un cierre para esa fecha' });

      closures.push({ date, capital, gross, expenses, investments, usdtProfit, debt });
      writeClosures(closures);

      const payload = { summary: calcSummary(closures), message: `Nuevo cierre cargado: ${formatWeek(date)}` };
      broadcast('closure-created', payload);
      return json(res, 201, payload);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (!serveStatic(res, pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`App lista en http://localhost:${PORT}`);
});
