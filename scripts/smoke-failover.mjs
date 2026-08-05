/**
 * Failover smoke: bad first URL must fall through to healthy second.
 * Run: node scripts/smoke-failover.mjs
 */
import WebSocket from 'ws';

const BAD = 'wss://127.0.0.1:9';
const GOOD = 'wss://electrum02.cyberyen.work:50004';

function call(ws, method, params = []) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 12000);
    const onMessage = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id !== id) return;
        clearTimeout(timer);
        ws.off('message', onMessage);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } catch (e) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        reject(e);
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, method, params, jsonrpc: '2.0' }));
  });
}

async function tryUrl(url) {
  const ws = new WebSocket(url, { handshakeTimeout: 3000 });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 4000);
    ws.once('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.once('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
  try {
    const tip = await call(ws, 'blockchain.headers.subscribe', []);
    const height = tip?.height ?? tip;
    const txid = await call(ws, 'blockchain.transaction.id_from_pos', [
      Math.max(1, height - 6),
      0,
      false,
    ]);
    await call(ws, 'blockchain.transaction.get', [txid, true]);
    return { url, ok: true, height, txid };
  } finally {
    ws.close();
  }
}

const urls = [BAD, GOOD];
let chosen = null;
const errors = [];
for (const url of urls) {
  try {
    chosen = await tryUrl(url);
    break;
  } catch (e) {
    errors.push({ url, error: e.message || String(e) });
  }
}

console.log(JSON.stringify({ chosen, errors }, null, 2));
if (!chosen?.ok || chosen.url !== GOOD) {
  console.error('FAILOVER FAIL');
  process.exit(1);
}
console.log('FAILOVER PASS');
