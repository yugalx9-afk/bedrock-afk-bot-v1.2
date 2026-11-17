const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
function duration(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
async function api(path, method = 'GET') {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}
function render(data) {
  $('status').textContent = data.status;
  $('server').textContent = `${data.config.host}:${data.config.port}`;
  $('username').textContent = data.config.username;
  $('uptime').textContent = duration(data.uptimeSeconds || 0);
  $('reconnects').textContent = data.reconnects || 0;
  $('attempts').textContent = data.attempts || 0;
  const pill = $('pill');
  pill.textContent = data.status.toUpperCase();
  pill.className = 'pill' + (data.status === 'online' ? ' online' : (data.status === 'disconnected' ? ' error' : ''));
  const login = data.msaCode;
  $('login').classList.toggle('hidden', !login);
  if (login) {
    $('userCode').textContent = login.userCode || 'Check deployment logs';
    $('loginMessage').textContent = login.message || 'Complete Microsoft account sign-in.';
    $('verifyLink').href = login.verificationUri || 'https://www.microsoft.com/link';
  }
  $('logs').innerHTML = '';
  if (!data.logs.length) $('logs').innerHTML = '<p class="muted">No activity yet.</p>';
  for (const item of data.logs) {
    const row = document.createElement('div');
    row.className = `log ${item.level || ''}`;
    const time = document.createElement('time');
    time.textContent = new Date(item.time).toLocaleTimeString();
    const message = document.createElement('span');
    message.textContent = item.message;
    row.append(time, message);
    $('logs').append(row);
  }
}
async function refresh() {
  try { render(await api('/api/state')); }
  catch (error) { $('status').textContent = error.message; }
}
$('start').addEventListener('click', async () => { await api('/api/start', 'POST'); refresh(); });
$('stop').addEventListener('click', async () => { await api('/api/stop', 'POST'); refresh(); });
$('reconnect').addEventListener('click', async () => { await api('/api/reconnect', 'POST'); refresh(); });
$('copyCode').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('userCode').textContent);
  $('copyCode').textContent = 'Copied';
  setTimeout(() => $('copyCode').textContent = 'Copy code', 1200);
});
$('clear').addEventListener('click', () => { $('logs').innerHTML = '<p class="muted">Refresh to reload server logs.</p>'; });
refresh();
setInterval(refresh, 2500);
