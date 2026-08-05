/**
 * Local smoke test: tip-probe + tx get against production Electrum endpoints.
 * Run: node scripts/smoke-electrum.mjs
 */
import WebSocket from 'ws';

const SERVERS = [
  'wss://electrum03.cyberyen.work:50004',
  'wss://electrum02.cyberyen.work:50004',
];

const KNOWN_TX =
  '5d4284f33af44cdf4c4aedebd5f8a9d454959dba3409805b8c1432641ce568ea';

function call(ws, method, params = []) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 15000);
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

async function probeServer(url) {
  const result = { url, ok: false, steps: {} };
  const ws = new WebSocket(url, { handshakeTimeout: 10000 });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  try {
    const version = await call(ws, 'server.version', ['cykuza-smoke', '1.4']);
    result.steps.version = version;

    const tip = await call(ws, 'blockchain.headers.subscribe', []);
    const height = tip?.height ?? tip;
    result.steps.tipHeight = height;

    const probeHeight = Math.max(1, height - 6);
    const tipTxid = await call(ws, 'blockchain.transaction.id_from_pos', [
      probeHeight,
      0,
      false,
    ]);
    result.steps.tipProbeTxid = tipTxid;

    const tipTx = await call(ws, 'blockchain.transaction.get', [tipTxid, true]);
    result.steps.tipProbeOk =
      typeof tipTx === 'object' ? tipTx.txid || tipTx.hash || 'object' : typeof tipTx;

    const known = await call(ws, 'blockchain.transaction.get', [KNOWN_TX, true]);
    result.steps.knownTx = {
      txid: known.txid,
      confirmations: known.confirmations,
      blockhash: known.blockhash,
    };

    result.ok = true;
  } finally {
    ws.close();
  }
  return result;
}

const outcomes = [];
for (const url of SERVERS) {
  try {
    const r = await probeServer(url);
    outcomes.push(r);
    console.log(JSON.stringify(r, null, 2));
  } catch (err) {
    const fail = { url, ok: false, error: err.message || String(err) };
    outcomes.push(fail);
    console.error(JSON.stringify(fail, null, 2));
  }
}

const allOk = outcomes.every((o) => o.ok);
console.log(allOk ? '\nSMOKE PASS' : '\nSMOKE FAIL');
process.exit(allOk ? 0 : 1);
