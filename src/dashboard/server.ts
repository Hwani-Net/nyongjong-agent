// Dashboard HTTP server — serves real-time agent status via SSE
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { createLogger } from '../utils/logger.js';
import { type AppConfig } from '../core/config.js';
import { initializeAgent, getAgentStatus } from '../agent.js';

const log = createLogger('dashboard');

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ko" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>뇽죵이 Agent Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #FAFAFA;
  --surface: #FFFFFF;
  --border: #E5E7EB;
  --text: #111827;
  --text-secondary: #6B7280;
  --accent: #6366F1;
  --accent-light: #EEF2FF;
  --green: #10B981;
  --red: #EF4444;
  --orange: #F59E0B;
}
[data-theme="dark"] {
  --bg: #0F172A;
  --surface: #1E293B;
  --border: #334155;
  --text: #F1F5F9;
  --text-secondary: #94A3B8;
  --accent: #818CF8;
  --accent-light: #1E1B4B;
  --green: #34D399;
  --red: #F87171;
  --orange: #FBBF24;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  transition: all 0.3s;
}
.container { max-width: 960px; margin: 0 auto; padding: 2rem; }
header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 2rem;
}
h1 { font-size: 1.5rem; font-weight: 700; }
h1 span { color: var(--accent); }
.theme-toggle {
  background: var(--surface); border: 1px solid var(--border);
  padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer;
  color: var(--text); font-size: 0.875rem;
}
.status-badge {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem;
  font-weight: 600;
}
.status-running { background: rgba(16,185,129,0.15); color: var(--green); }
.status-error { background: rgba(239,68,68,0.15); color: var(--red); }
.grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem; margin-bottom: 2rem;
}
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 1.25rem;
  transition: box-shadow 0.2s;
}
.card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.card-title {
  font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 0.75rem;
}
.card-value { font-size: 1.75rem; font-weight: 700; }
.card-sub { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem; }
.tool-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}
.tool-chip {
  background: var(--accent-light); color: var(--accent);
  padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 0.75rem;
  font-weight: 500; text-align: center;
}
.log-area {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 1rem; font-family: monospace;
  font-size: 0.75rem; max-height: 240px; overflow-y: auto;
  color: var(--text-secondary);
}
.log-entry { padding: 0.25rem 0; border-bottom: 1px solid var(--border); }
.pulse { animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
footer {
  text-align: center; padding: 2rem 0; font-size: 0.75rem;
  color: var(--text-secondary);
}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>🐾 <span>뇽죵이</span> Agent</h1>
    <div>
      <span id="statusBadge" class="status-badge status-running">
        <span class="pulse">●</span> Connecting...
      </span>
      <button class="theme-toggle" onclick="toggleTheme()">🌗</button>
    </div>
  </header>

  <div class="grid">
    <div class="card">
      <div class="card-title">Version</div>
      <div class="card-value" id="version">—</div>
    </div>
    <div class="card">
      <div class="card-title">MCP Tools</div>
      <div class="card-value" id="toolCount">—</div>
    </div>
    <div class="card">
      <div class="card-title">Ollama</div>
      <div class="card-value" id="ollamaStatus">—</div>
      <div class="card-sub" id="ollamaModels"></div>
    </div>
    <div class="card">
      <div class="card-title">Active Task</div>
      <div class="card-value" id="activeTask" style="font-size:1rem">—</div>
    </div>
  </div>

  <h2 style="margin-bottom:0.75rem; font-size:1rem;">🔧 Available Tools</h2>
  <div id="toolGrid" class="tool-grid" style="margin-bottom:2rem;"></div>

  <h2 style="margin-bottom:0.75rem; font-size:1rem;">📋 Event Log</h2>
  <div id="logArea" class="log-area">Waiting for events...</div>

  <footer>뇽죵이 Agent v0.3.0 — Powered by MCP</footer>
</div>

<script>
const tools = [
  'agent_status','task_list','task_create','recommend_model','list_models',
  'memory_search','memory_write','persona_list','persona_consult',
  'analyze_goal','ollama_health','ground_check','run_cycle'
];
document.getElementById('toolGrid').innerHTML = tools.map(t =>
  '<div class="tool-chip">' + t + '</div>'
).join('');
document.getElementById('toolCount').textContent = tools.length;

function toggleTheme() {
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', html.dataset.theme);
}
if (localStorage.getItem('theme') === 'dark') document.documentElement.dataset.theme = 'dark';

function addLog(msg) {
  const area = document.getElementById('logArea');
  const ts = new Date().toLocaleTimeString('ko-KR');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = ts + ' — ' + msg;
  area.prepend(entry);
  if (area.children.length > 50) area.lastChild.remove();
}

// SSE connection
const evtSource = new EventSource('/events');
evtSource.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    document.getElementById('version').textContent = data.version || '—';
    document.getElementById('statusBadge').className = 'status-badge status-running';
    document.getElementById('statusBadge').innerHTML = '<span class="pulse">●</span> Running';

    if (data.modules?.ollama?.available) {
      document.getElementById('ollamaStatus').textContent = '✅ Online';
      document.getElementById('ollamaModels').textContent =
        (data.modules.ollama.models || []).join(', ');
    } else {
      document.getElementById('ollamaStatus').textContent = '⚠️ Offline';
    }

    document.getElementById('activeTask').textContent =
      data.activeTask ? data.activeTask.title : 'No active task';

    addLog('Status updated: v' + data.version);
  } catch {}
};
evtSource.onerror = () => {
  document.getElementById('statusBadge').className = 'status-badge status-error';
  document.getElementById('statusBadge').innerHTML = '● Disconnected';
  addLog('Connection lost');
};

addLog('Dashboard loaded');
</script>
</body>
</html>`;

export interface DashboardOptions {
  config: AppConfig;
  port?: number;
}

export async function startDashboard(options: DashboardOptions): Promise<void> {
  const { config, port = 3100 } = options;
  const modules = initializeAgent(config);
  const sseClients = new Set<ServerResponse>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '/';

    if (url === '/events') {
      // SSE endpoint
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));

      // Send initial status
      const status = await getAgentStatus(modules, config);
      res.write(`data: ${JSON.stringify(status)}\n\n`);
      return;
    }

    if (url === '/api/status') {
      const status = await getAgentStatus(modules, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status, null, 2));
      return;
    }

    // Serve dashboard HTML
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(DASHBOARD_HTML);
  });

  // Periodic SSE broadcast
  setInterval(async () => {
    if (sseClients.size === 0) return;
    try {
      const status = await getAgentStatus(modules, config);
      const data = `data: ${JSON.stringify(status)}\n\n`;
      for (const client of sseClients) {
        client.write(data);
      }
    } catch (err) {
      log.warn('SSE broadcast error', err);
    }
  }, 5000);

  server.listen(port, () => {
    log.info(`🐾 Dashboard running at http://localhost:${port}`);
  });
}
