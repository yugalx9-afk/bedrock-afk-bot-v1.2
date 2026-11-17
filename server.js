require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const bedrock = require('bedrock-protocol');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

const settingsPath = path.join(__dirname, 'settings.json');
let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (err) {
  console.error('Could not read settings.json:', err.message);
  process.exit(1);
}

const PORT = Number(process.env.PORT || settings.dashboard?.port || 3000);
const HOST = process.env.HOST || settings.dashboard?.host || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || settings.storage?.dataDirectory || path.join(__dirname, 'data');
const AUTH_DIR = path.join(DATA_DIR, 'auth-cache');
fs.mkdirSync(AUTH_DIR, { recursive: true });

const config = {
  host: process.env.MC_HOST || settings.server?.host || 'localhost',
  port: Number(process.env.MC_PORT || settings.server?.port || 19132),
  // Leave blank to let the Microsoft-authenticated profile provide the account identity.
  username: process.env.MC_USERNAME || settings.minecraft?.username || '',
  reconnect: String(process.env.AUTO_RECONNECT ?? settings.bot?.autoReconnect ?? true).toLowerCase() !== 'false',
  autoStart: String(process.env.BOT_AUTOSTART ?? settings.bot?.autoStart ?? false).toLowerCase() === 'true',
  minDelay: Math.max(1000, Number(process.env.RECONNECT_MIN_MS || settings.bot?.reconnectMinMs || 5000)),
  maxDelay: Math.max(5000, Number(process.env.RECONNECT_MAX_MS || settings.bot?.reconnectMaxMs || 60000))
};

const state = {
  status: 'stopped',
  startedAt: null,
  connectedAt: null,
  reconnects: 0,
  attempts: 0,
  lastError: null,
  msaCode: null,
  logs: []
};

let client = null;
let reconnectTimer = null;
let manuallyStopped = true;
let retryDelay = config.minDelay;
let generation = 0;

function log(message, level = 'info') {
  const entry = { time: new Date().toISOString(), level, message: String(message).slice(0, 500) };
  state.logs.unshift(entry);
  state.logs = state.logs.slice(0, 120);
  console.log(`[${entry.level.toUpperCase()}] ${entry.message}`);
}

function snapshot() {
  return {
    ...state,
    logs: state.logs,
    config: { host: config.host, port: config.port, username: config.username || '(Microsoft account profile)', reconnect: config.reconnect },
    uptimeSeconds: state.connectedAt ? Math.floor((Date.now() - state.connectedAt) / 1000) : 0,
    uptimeTotalSeconds: state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0
  };
}

function clearReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(reason, thisGeneration) {
  if (manuallyStopped || !config.reconnect || thisGeneration !== generation || reconnectTimer) return;
  state.status = 'reconnecting';
  const wait = retryDelay;
  state.reconnects += 1;
  retryDelay = Math.min(config.maxDelay, Math.max(config.minDelay, retryDelay * 2));
  log(`${reason}. Reconnecting in ${Math.round(wait / 1000)} seconds.`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBot();
  }, wait);
}

function connectBot() {
  if (manuallyStopped) return;
  clearReconnect();
  const thisGeneration = generation;
  state.status = 'connecting';
  state.attempts += 1;
  state.msaCode = null;
  log(`Connecting to ${config.host}:${config.port} using Microsoft authentication...`);

  try {
    const options = {
      host: config.host,
      port: config.port,
      offline: false,
      profilesFolder: AUTH_DIR,
      onMsaCode: (data) => {
        if (thisGeneration !== generation) return;
        state.msaCode = {
          userCode: data.user_code || data.userCode || '',
          verificationUri: data.verification_uri || data.verificationUri || 'https://www.microsoft.com/link',
          message: data.message || 'Complete Microsoft account sign-in using this code.'
        };
        log(`Microsoft sign-in required. Open ${state.msaCode.verificationUri} and enter the displayed code.`);
      }
    };
    if (config.username) options.username = config.username;

    const nextClient = bedrock.createClient(options);
    client = nextClient;
    nextClient.on('status', (status) => {
      if (thisGeneration === generation) log(`Client status: ${JSON.stringify(status)}`);
    });
    nextClient.on('join', () => {
      if (thisGeneration !== generation) return;
      state.status = 'joining';
      log('Account authenticated; joining the world...');
    });
    nextClient.on('spawn', () => {
      if (thisGeneration !== generation) return;
      state.status = 'online';
      state.connectedAt = Date.now();
      state.lastError = null;
      state.msaCode = null;
      retryDelay = config.minDelay;
      log('Bot spawned successfully.');
    });
    nextClient.on('kick', (reason) => {
      if (thisGeneration !== generation) return;
      const msg = typeof reason === 'string' ? reason : JSON.stringify(reason);
      state.lastError = `Kicked: ${msg}`;
      log(state.lastError, 'warn');
    });
    nextClient.on('error', (err) => {
      if (thisGeneration !== generation) return;
      state.lastError = err?.message || String(err);
      log(`Client error: ${state.lastError}`, 'error');
    });
    nextClient.on('close', () => {
      if (thisGeneration !== generation) return;
      state.connectedAt = null;
      if (state.status !== 'stopped') {
        state.status = 'disconnected';
        scheduleReconnect('Connection closed', thisGeneration);
      }
    });
  } catch (err) {
    state.lastError = err?.message || String(err);
    log(`Could not create client: ${state.lastError}`, 'error');
    scheduleReconnect('Connection attempt failed', thisGeneration);
  }
}

function startBot() {
  if (!manuallyStopped && ['connecting', 'joining', 'online', 'reconnecting'].includes(state.status)) {
    return { ok: true, message: 'Bot is already running.' };
  }
  manuallyStopped = false;
  generation += 1;
  state.startedAt = Date.now();
  state.connectedAt = null;
  state.status = 'starting';
  retryDelay = config.minDelay;
  connectBot();
  return { ok: true, message: 'Bot start requested.' };
}

function stopBot() {
  manuallyStopped = true;
  generation += 1;
  clearReconnect();
  const old = client;
  client = null;
  state.status = 'stopped';
  state.connectedAt = null;
  state.startedAt = null;
  state.msaCode = null;
  if (old) {
    try { old.close(); } catch (_) {}
  }
  log('Bot stopped manually.');
  return { ok: true, message: 'Bot stopped.' };
}

const dashboardPassword = process.env.DASHBOARD_PASSWORD;
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (!dashboardPassword) return res.status(503).send('Dashboard locked: set DASHBOARD_PASSWORD in environment variables.');
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="Bedrock Bot Dashboard"');
    return res.status(401).send('Authentication required.');
  }
  let decoded = '';
  try { decoded = Buffer.from(encoded, 'base64').toString('utf8'); } catch (_) {}
  const colon = decoded.indexOf(':');
  const supplied = colon >= 0 ? decoded.slice(colon + 1) : '';
  if (colon < 0 || supplied !== dashboardPassword) {
    res.set('WWW-Authenticate', 'Basic realm="Bedrock Bot Dashboard"');
    return res.status(401).send('Incorrect dashboard password.');
  }
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/state', (_req, res) => res.json(snapshot()));
app.post('/api/start', (_req, res) => res.json(startBot()));
app.post('/api/stop', (_req, res) => res.json(stopBot()));
app.post('/api/reconnect', (_req, res) => {
  stopBot();
  startBot();
  res.json({ ok: true, message: 'Reconnect requested.' });
});

app.listen(PORT, HOST, () => {
  log(`Dashboard listening on ${HOST}:${PORT}`);
  log(`Configured server: ${config.host}:${config.port}`);
  if (config.autoStart) startBot();
});

process.on('SIGTERM', stopBot);
process.on('SIGINT', stopBot);
