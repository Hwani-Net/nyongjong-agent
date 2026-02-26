// Dashboard HTTP server — Phase 4 full dashboard with kanban, personas, tool groups
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
<meta name="description" content="뇽죵이 AI Agent real-time dashboard — task management, persona library, tool monitoring">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #F8FAFC;
  --surface: #FFFFFF;
  --surface-alt: #F1F5F9;
  --border: #E2E8F0;
  --text: #0F172A;
  --text-secondary: #64748B;
  --accent: #6366F1;
  --accent-hover: #4F46E5;
  --accent-light: #EEF2FF;
  --green: #10B981;
  --green-light: #D1FAE5;
  --red: #EF4444;
  --red-light: #FEE2E2;
  --orange: #F59E0B;
  --orange-light: #FEF3C7;
  --blue: #3B82F6;
  --blue-light: #DBEAFE;
  --purple: #8B5CF6;
  --purple-light: #EDE9FE;
  --pink: #EC4899;
  --pink-light: #FCE7F3;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.07), 0 4px 6px -2px rgba(0,0,0,0.04);
  --radius: 12px;
  --radius-sm: 8px;
}
[data-theme="dark"] {
  --bg: #0F172A;
  --surface: #1E293B;
  --surface-alt: #334155;
  --border: #475569;
  --text: #F1F5F9;
  --text-secondary: #94A3B8;
  --accent: #818CF8;
  --accent-hover: #6366F1;
  --accent-light: #1E1B4B;
  --green: #34D399;
  --green-light: rgba(16,185,129,0.15);
  --red: #F87171;
  --red-light: rgba(239,68,68,0.15);
  --orange: #FBBF24;
  --orange-light: rgba(245,158,11,0.15);
  --blue: #60A5FA;
  --blue-light: rgba(59,130,246,0.15);
  --purple: #A78BFA;
  --purple-light: rgba(139,92,246,0.15);
  --pink: #F472B6;
  --pink-light: rgba(236,72,153,0.15);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.3);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  transition: background 0.3s, color 0.3s;
}

/* Shell layout */
.shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 260px; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; position: fixed; height: 100vh;
  z-index: 10;
}
.sidebar-header {
  padding: 1.25rem; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 0.75rem;
}
.sidebar-header h1 { font-size: 1.125rem; font-weight: 800; }
.sidebar-header h1 span { color: var(--accent); }
.sidebar-nav { flex: 1; padding: 0.75rem; overflow-y: auto; }
.nav-item {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.625rem 0.75rem; border-radius: var(--radius-sm);
  cursor: pointer; font-size: 0.875rem; font-weight: 500;
  color: var(--text-secondary); transition: all 0.2s;
  margin-bottom: 2px;
}
.nav-item:hover { background: var(--surface-alt); color: var(--text); }
.nav-item.active { background: var(--accent-light); color: var(--accent); font-weight: 600; }
.nav-item .icon { font-size: 1.125rem; width: 1.5rem; text-align: center; }
.sidebar-footer {
  padding: 1rem; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}

/* Main content */
.main { flex: 1; margin-left: 260px; }
.topbar {
  height: 56px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 1.5rem; background: var(--surface);
  position: sticky; top: 0; z-index: 5;
}
.topbar-title { font-size: 1rem; font-weight: 700; }
.topbar-actions { display: flex; align-items: center; gap: 0.75rem; }
.content { padding: 1.5rem; }

/* Status badge */
.badge {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem;
  font-weight: 600;
}
.badge-green { background: var(--green-light); color: var(--green); }
.badge-red { background: var(--red-light); color: var(--red); }
.badge-orange { background: var(--orange-light); color: var(--orange); }
.badge-blue { background: var(--blue-light); color: var(--blue); }
.badge-purple { background: var(--purple-light); color: var(--purple); }

/* Button */
.btn {
  padding: 0.5rem 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font-size: 0.8125rem;
  font-weight: 500; cursor: pointer; transition: all 0.2s;
  display: inline-flex; align-items: center; gap: 0.375rem;
}
.btn:hover { background: var(--surface-alt); box-shadow: var(--shadow-sm); }
.btn-accent { background: var(--accent); color: white; border-color: var(--accent); }
.btn-accent:hover { background: var(--accent-hover); }

/* Cards */
.kpi-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem; margin-bottom: 1.5rem;
}
.kpi-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1.25rem;
  box-shadow: var(--shadow-sm); transition: all 0.2s;
}
.kpi-card:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
.kpi-label {
  font-size: 0.6875rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 0.5rem;
}
.kpi-value { font-size: 1.75rem; font-weight: 800; line-height: 1; }
.kpi-sub { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.375rem; }

/* Kanban */
.kanban {
  display: grid; grid-template-columns: repeat(6, 1fr);
  gap: 0.75rem; margin-bottom: 1.5rem; min-height: 200px;
}
.kanban-col {
  background: var(--surface-alt); border-radius: var(--radius);
  padding: 0.75rem; min-height: 180px;
}
.kanban-header {
  font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; margin-bottom: 0.75rem; padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--border); display: flex;
  align-items: center; gap: 0.375rem;
}
.kanban-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 0.625rem;
  margin-bottom: 0.5rem; font-size: 0.75rem; font-weight: 500;
  box-shadow: var(--shadow-sm); cursor: default;
  transition: box-shadow 0.2s;
}
.kanban-card:hover { box-shadow: var(--shadow); }
.kanban-card .priority {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  margin-right: 0.375rem;
}
.priority-high { background: var(--red); }
.priority-normal { background: var(--blue); }
.priority-low { background: var(--text-secondary); }

/* Tool groups */
.tool-groups {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}
.tool-group {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1rem; box-shadow: var(--shadow-sm);
}
.tool-group-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 0.75rem;
}
.tool-group-name {
  font-size: 0.8125rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.03em;
}
.tool-chip {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.25rem 0.625rem; border-radius: 6px; font-size: 0.6875rem;
  font-weight: 500; margin: 0.125rem;
}
.tool-enabled { background: var(--accent-light); color: var(--accent); }
.tool-disabled { background: var(--surface-alt); color: var(--text-secondary); text-decoration: line-through; opacity: 0.6; }

/* Persona grid */
.persona-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
.persona-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1.25rem;
  box-shadow: var(--shadow-sm); transition: all 0.2s;
}
.persona-card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
.persona-avatar { font-size: 2rem; margin-bottom: 0.5rem; }
.persona-name { font-size: 0.9375rem; font-weight: 700; margin-bottom: 0.25rem; }
.persona-category { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; }

/* Log */
.log-area {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1rem; font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem; max-height: 300px; overflow-y: auto;
  color: var(--text-secondary);
}
.log-entry {
  padding: 0.25rem 0; border-bottom: 1px solid var(--border);
  display: flex; gap: 0.5rem;
}
.log-ts { color: var(--accent); font-weight: 500; flex-shrink: 0; }

/* Animations */
.pulse { animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
.fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* Section */
.section { margin-bottom: 1.5rem; }
.section-title {
  font-size: 0.9375rem; font-weight: 700; margin-bottom: 0.75rem;
  display: flex; align-items: center; gap: 0.5rem;
}

/* Responsive */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .main { margin-left: 0; }
  .kanban { grid-template-columns: repeat(2, 1fr); }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
}

/* Toggle switch */
.toggle {
  position: relative; width: 36px; height: 20px;
  background: var(--border); border-radius: 10px;
  cursor: pointer; transition: background 0.2s;
}
.toggle.on { background: var(--accent); }
.toggle::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; background: white;
  border-radius: 50%; transition: transform 0.2s;
}
.toggle.on::after { transform: translateX(16px); }

/* Page visibility */
.page { display: none; }
.page.active { display: block; }

/* Terminal */
.terminal-area {
  background: #0D1117; color: #58A6FF; border-radius: var(--radius);
  padding: 1rem; font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
  font-size: 0.75rem; max-height: 400px; overflow-y: auto;
  white-space: pre-wrap; line-height: 1.6; border: 1px solid #30363D;
}
.terminal-area .cmd { color: #79C0FF; }
.terminal-area .ok { color: #3FB950; }
.terminal-area .err { color: #F85149; }
.terminal-area .info { color: #8B949E; }

/* Settings */
.settings-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}
.settings-section { }
.setting-select {
  width: 100%; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface-alt);
  color: var(--text); font-size: 0.8125rem; font-family: inherit;
  margin-top: 0.5rem; cursor: pointer;
}
.api-key-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.375rem 0; font-size: 0.8125rem; font-family: monospace;
  border-bottom: 1px solid var(--border);
}

/* Decision Inbox */
.decision-list { display: grid; gap: 0.75rem; }
.decision-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1.25rem;
  box-shadow: var(--shadow-sm); transition: all 0.2s;
  border-left: 4px solid var(--orange);
}
.decision-card.approved { border-left-color: var(--green); opacity: 0.6; }
.decision-card.rejected { border-left-color: var(--red); opacity: 0.6; }
.decision-title { font-size: 0.9375rem; font-weight: 700; margin-bottom: 0.375rem; }
.decision-meta { font-size: 0.6875rem; color: var(--text-secondary); margin-bottom: 0.75rem; }
.decision-actions { display: flex; gap: 0.5rem; }

/* Chat Panel */
.chat-container { display: flex; flex-direction: column; height: calc(100vh - 140px); }
.chat-messages {
  flex: 1; overflow-y: auto; padding: 1rem;
  display: flex; flex-direction: column; gap: 0.75rem;
}
.chat-bubble {
  max-width: 75%; padding: 0.75rem 1rem; border-radius: var(--radius);
  font-size: 0.875rem; line-height: 1.5; animation: fadeSlideUp 0.3s ease;
}
.chat-bubble.user {
  align-self: flex-end; background: var(--accent); color: white;
  border-bottom-right-radius: 4px;
}
.chat-bubble.agent {
  align-self: flex-start; background: var(--surface-alt); color: var(--text);
  border-bottom-left-radius: 4px; border: 1px solid var(--border);
}
.chat-bubble .sender { font-size: 0.6875rem; font-weight: 700; margin-bottom: 0.25rem; opacity: 0.7; }
.chat-input-area {
  display: flex; gap: 0.5rem; padding: 0.75rem;
  border-top: 1px solid var(--border); background: var(--surface);
}
.chat-input {
  flex: 1; padding: 0.625rem 0.875rem; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface-alt);
  color: var(--text); font-size: 0.875rem; font-family: inherit;
  outline: none; transition: border-color 0.2s;
}
.chat-input:focus { border-color: var(--accent); }
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Office View */
.office-container {
  position: relative; height: calc(100vh - 140px);
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  border-radius: var(--radius); overflow: hidden;
  image-rendering: pixelated;
}
.office-grid {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px;
  padding: 2rem; height: 100%;
}
.office-desk {
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 1rem; text-align: center;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.5rem; transition: all 0.3s; position: relative;
}
.office-desk:hover { background: rgba(255,255,255,0.1); transform: scale(1.02); }
.office-desk.active { border-color: var(--accent); box-shadow: 0 0 20px rgba(99,102,241,0.3); }
.desk-agent { font-size: 2rem; animation: agentBounce 2s ease-in-out infinite; }
.desk-label { font-size: 0.6875rem; color: rgba(255,255,255,0.7); font-weight: 500; }
.desk-status {
  font-size: 0.5625rem; padding: 2px 6px; border-radius: 4px;
  background: rgba(16,185,129,0.2); color: #10B981;
}
.desk-status.busy { background: rgba(245,158,11,0.2); color: #F59E0B; }
@keyframes agentBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.office-floor {
  position: absolute; bottom: 0; left: 0; right: 0; height: 60px;
  background: repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 32px, rgba(255,255,255,0.01) 32px, rgba(255,255,255,0.01) 64px);
}
</style>
</head>
<body>
<div class="shell">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <span style="font-size:1.5rem">🐾</span>
      <h1><span>뇽죵이</span> Agent</h1>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-item active" data-page="dashboard" onclick="showPage('dashboard')">
        <span class="icon">📊</span> Dashboard
      </div>
      <div class="nav-item" data-page="kanban" onclick="showPage('kanban')">
        <span class="icon">📋</span> Kanban Board
      </div>
      <div class="nav-item" data-page="tools" onclick="showPage('tools')">
        <span class="icon">🔧</span> Tool Registry
      </div>
      <div class="nav-item" data-page="personas" onclick="showPage('personas')">
        <span class="icon">🎭</span> Personas
      </div>
      <div class="nav-item" data-page="chat" onclick="showPage('chat')">
        <span class="icon">💬</span> Chat
      </div>
      <div class="nav-item" data-page="office" onclick="showPage('office')">
        <span class="icon">🎮</span> Office
      </div>
      <div class="nav-item" data-page="terminal" onclick="showPage('terminal')">
        <span class="icon">🖥️</span> Terminal
      </div>
      <div class="nav-item" data-page="inbox" onclick="showPage('inbox')">
        <span class="icon">📨</span> Decision Inbox
      </div>
      <div class="nav-item" data-page="settings" onclick="showPage('settings')">
        <span class="icon">⚙️</span> Settings
      </div>
      <div class="nav-item" data-page="logs" onclick="showPage('logs')">
        <span class="icon">📝</span> Event Log
      </div>
    </nav>
    <div class="sidebar-footer">
      <span style="font-size:0.75rem; color:var(--text-secondary)">v0.3.0</span>
      <button class="btn" onclick="toggleTheme()" style="padding:0.375rem 0.625rem">🌗</button>
    </div>
  </aside>

  <!-- Main -->
  <div class="main">
    <div class="topbar">
      <span class="topbar-title" id="pageTitle">📊 Dashboard</span>
      <div class="topbar-actions">
        <span id="statusBadge" class="badge badge-orange">
          <span class="pulse">●</span> Connecting...
        </span>
      </div>
    </div>
    <div class="content">

      <!-- Dashboard page -->
      <div class="page active" id="page-dashboard">
        <div class="kpi-grid fade-in">
          <div class="kpi-card">
            <div class="kpi-label">Status</div>
            <div class="kpi-value" id="kpiStatus">—</div>
            <div class="kpi-sub" id="kpiVersion"></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">MCP Tools</div>
            <div class="kpi-value" id="kpiTools">—</div>
            <div class="kpi-sub" id="kpiToolsSub"></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Ollama</div>
            <div class="kpi-value" id="kpiOllama">—</div>
            <div class="kpi-sub" id="kpiOllamaModels"></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Active Task</div>
            <div class="kpi-value" id="kpiTask" style="font-size:1rem;line-height:1.4">—</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Task Queue</div>
            <div class="kpi-value" id="kpiQueue">0</div>
            <div class="kpi-sub" id="kpiQueueSub"></div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Personas</div>
            <div class="kpi-value" id="kpiPersonas">—</div>
            <div class="kpi-sub" id="kpiPersonasSub"></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📋 Task Queue</div>
          <div id="dashboardQueue" style="display:grid;gap:0.5rem;"></div>
        </div>
      </div>

      <!-- Kanban page -->
      <div class="page" id="page-kanban">
        <div class="kanban fade-in" id="kanbanBoard">
          <div class="kanban-col" data-stage="queued">
            <div class="kanban-header">📥 대기열</div>
            <div class="kanban-items" data-stage="queued"></div>
          </div>
          <div class="kanban-col" data-stage="understand">
            <div class="kanban-header">🧠 이해</div>
            <div class="kanban-items" data-stage="understand"></div>
          </div>
          <div class="kanban-col" data-stage="prototype">
            <div class="kanban-header">⚡ 프로토</div>
            <div class="kanban-items" data-stage="prototype"></div>
          </div>
          <div class="kanban-col" data-stage="validate">
            <div class="kanban-header">✅ 검증</div>
            <div class="kanban-items" data-stage="validate"></div>
          </div>
          <div class="kanban-col" data-stage="evolve">
            <div class="kanban-header">🔄 진화</div>
            <div class="kanban-items" data-stage="evolve"></div>
          </div>
          <div class="kanban-col" data-stage="report">
            <div class="kanban-header">📋 보고</div>
            <div class="kanban-items" data-stage="report"></div>
          </div>
        </div>
      </div>

      <!-- Tools page -->
      <div class="page" id="page-tools">
        <div class="tool-groups fade-in" id="toolGroupsGrid"></div>
      </div>

      <!-- Personas page -->
      <div class="page" id="page-personas">
        <div class="persona-grid fade-in" id="personaGrid"></div>
      </div>

      <!-- Chat page -->
      <div class="page" id="page-chat">
        <div class="chat-container fade-in">
          <div class="chat-messages" id="chatMessages">
            <div class="chat-bubble agent">
              <div class="sender">🐾 뇽죵이</div>
              안녕하세요 대표님! 뇽죵이 에이전트입니다. 무엇을 도와드릴까요?
            </div>
          </div>
          <div class="chat-input-area">
            <input type="text" class="chat-input" id="chatInput" placeholder="메시지를 입력하세요..." onkeydown="if(event.key==='Enter')sendChat()">
            <button class="btn btn-accent" onclick="sendChat()">전송</button>
          </div>
        </div>
      </div>

      <!-- Office page -->
      <div class="page" id="page-office">
        <div class="office-container fade-in">
          <div class="office-grid" id="officeGrid"></div>
          <div class="office-floor"></div>
        </div>
      </div>

      <!-- Terminal page -->
      <div class="page" id="page-terminal">
        <div class="section fade-in">
          <div class="section-title">🖥️ Terminal Output</div>
          <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
            <button class="btn btn-accent" onclick="runAction('build')">🔨 Build</button>
            <button class="btn" onclick="runAction('test')">🧪 Test</button>
            <button class="btn" onclick="runAction('lint')">🔍 Lint</button>
            <button class="btn" onclick="clearTerminal()">🗑️ Clear</button>
          </div>
          <div id="terminalOutput" class="terminal-area">$ Ready for commands...</div>
        </div>
        <div class="section">
          <div class="section-title">📊 Grounding API Calls</div>
          <div id="groundingLog" class="log-area" style="max-height:200px">No grounding calls yet</div>
        </div>
      </div>

      <!-- Decision Inbox page -->
      <div class="page" id="page-inbox">
        <div class="section fade-in">
          <div class="section-title">📨 Decision Inbox — 판단 게이트</div>
          <div id="decisionList" class="decision-list"></div>
        </div>
      </div>

      <!-- Settings page -->
      <div class="page" id="page-settings">
        <div class="settings-grid fade-in">
          <div class="settings-section">
            <div class="section-title">🤖 Model Selection</div>
            <div class="kpi-card">
              <div class="kpi-label">Primary Model</div>
              <select id="settingModel" class="setting-select">
                <option value="gemma3:4b">gemma3:4b (Default)</option>
                <option value="gemma3:12b">gemma3:12b</option>
                <option value="llama3.2:3b">llama3.2:3b</option>
                <option value="qwen2.5:7b">qwen2.5:7b</option>
                <option value="phi4:14b">phi4:14b</option>
              </select>
            </div>
          </div>
          <div class="settings-section">
            <div class="section-title">🔌 Ollama Status</div>
            <div class="kpi-card">
              <div class="kpi-label">Connection</div>
              <div class="kpi-value" id="settingOllamaStatus">—</div>
              <div class="kpi-sub" id="settingOllamaUrl"></div>
            </div>
            <div class="kpi-card" style="margin-top:0.75rem">
              <div class="kpi-label">Available Models</div>
              <div id="settingModelList" style="font-size:0.8125rem;color:var(--text-secondary)">Loading...</div>
            </div>
          </div>
          <div class="settings-section">
            <div class="section-title">🔑 API Keys</div>
            <div class="kpi-card">
              <div class="api-key-row"><span>NAVER_CLIENT_ID</span><span class="badge badge-orange">Not Set</span></div>
              <div class="api-key-row"><span>KOSIS_API_KEY</span><span class="badge badge-orange">Not Set</span></div>
              <div class="api-key-row" style="margin-top:0.5rem;font-size:0.6875rem;color:var(--text-secondary)">API keys are managed via environment variables</div>
            </div>
          </div>
          <div class="settings-section">
            <div class="section-title">📂 Vault Config</div>
            <div class="kpi-card">
              <div class="kpi-label">Obsidian Vault Path</div>
              <div id="settingVaultPath" style="font-family:monospace;font-size:0.75rem;word-break:break-all">—</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Logs page -->
      <div class="page" id="page-logs">
        <div class="log-area fade-in" id="logArea">Waiting for events...</div>
      </div>

    </div>
  </div>
</div>

<script>
// Theme
function toggleTheme() {
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', html.dataset.theme);
}
if (localStorage.getItem('theme') === 'dark') document.documentElement.dataset.theme = 'dark';

// Navigation
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector('[data-page="' + page + '"]').classList.add('active');
  const titles = { dashboard:'📊 Dashboard', kanban:'📋 Kanban Board', tools:'🔧 Tool Registry', personas:'🎭 Personas', chat:'💬 Chat', office:'🎮 Office', terminal:'🖥️ Terminal', inbox:'📨 Decision Inbox', settings:'⚙️ Settings', logs:'📝 Event Log' };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  if (page === 'office') renderOffice();
}

// Chat panel
function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addChatBubble(msg, 'user', '👤 대표님');
  setTimeout(() => {
    const responses = [
      '알겠습니다 대표님! 분석 중입니다... 🤔',
      '해당 작업을 태스크 큐에 추가했습니다. 📝',
      '페르소나 자문을 진행하겠습니다. 🎭',
      '빌드 결과를 확인 중입니다... 🔨',
      '그라운딩 데이터를 검색하겠습니다. 🔍',
    ];
    addChatBubble(responses[Math.floor(Math.random() * responses.length)], 'agent', '🐾 뇽죵이');
  }, 800);
}
function addChatBubble(text, role, sender) {
  const area = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-bubble ' + role;
  div.innerHTML = '<div class="sender">' + sender + '</div>' + text;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

// Office view
const officeDesks = [
  { emoji: '🐾', name: '뇽죵이', role: 'CEO Agent', status: 'active' },
  { emoji: '💼', name: 'CEO Naedon', role: 'Business', status: 'idle' },
  { emoji: '🤔', name: 'Philosopher', role: 'Advisor', status: 'idle' },
  { emoji: '⚙️', name: 'Engineer', role: 'Technical', status: 'idle' },
  { emoji: '🔒', name: 'Auditor', role: 'Security', status: 'idle' },
  { emoji: '👤', name: 'User Advocate', role: 'Customer', status: 'idle' },
];
function renderOffice() {
  const grid = document.getElementById('officeGrid');
  grid.innerHTML = officeDesks.map(d => {
    const isActive = d.status === 'active';
    return '<div class="office-desk' + (isActive ? ' active' : '') + '">' +
      '<div class="desk-agent">' + d.emoji + '</div>' +
      '<div class="desk-label">' + d.name + '</div>' +
      '<div class="desk-status' + (isActive ? ' busy' : '') + '">' + (isActive ? '🟢 Active' : '⚪ Idle') + '</div>' +
    '</div>';
  }).join('');
}

// Terminal panel
let terminalLines = ['$ Ready for commands...'];
function appendTerminal(text, cls) {
  const area = document.getElementById('terminalOutput');
  terminalLines.push(text);
  if (terminalLines.length > 200) terminalLines = terminalLines.slice(-100);
  area.innerHTML = terminalLines.map(l => {
    if (l.startsWith('✅')) return '<span class="ok">' + l + '</span>';
    if (l.startsWith('❌') || l.startsWith('ERROR')) return '<span class="err">' + l + '</span>';
    if (l.startsWith('$')) return '<span class="cmd">' + l + '</span>';
    return '<span class="info">' + l + '</span>';
  }).join('\n');
  area.scrollTop = area.scrollHeight;
}
function clearTerminal() { terminalLines = []; document.getElementById('terminalOutput').innerHTML = ''; }
async function runAction(action) {
  appendTerminal('$ npm run ' + action);
  appendTerminal('⏳ Running...');
  try {
    const res = await fetch('/api/action/' + action, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      appendTerminal('✅ ' + action + ' completed successfully');
      if (result.output) appendTerminal(result.output);
    } else {
      appendTerminal('❌ ' + action + ' failed: ' + (result.error || 'unknown'));
    }
  } catch(e) { appendTerminal('❌ Network error: ' + e.message); }
}

// Decision Inbox
let decisions = [];
function renderDecisions() {
  const el = document.getElementById('decisionList');
  if (decisions.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-secondary)">📭 의사결정이 필요한 항목이 없습니다</div>';
    return;
  }
  el.innerHTML = decisions.map((d,i) => {
    const stateClass = d.state === 'approved' ? 'approved' : d.state === 'rejected' ? 'rejected' : '';
    return '<div class="decision-card ' + stateClass + '">' +
      '<div class="decision-title">' + d.title + '</div>' +
      '<div class="decision-meta">Stage: ' + d.stage + ' | Priority: ' + d.priority + ' | ' + d.timestamp + '</div>' +
      (d.state === 'pending' ? '<div class="decision-actions">' +
        '<button class="btn btn-accent" onclick="resolveDecision(' + i + ',\'approved\')">✅ Approve</button>' +
        '<button class="btn" onclick="resolveDecision(' + i + ',\'rejected\')">❌ Reject</button>' +
      '</div>' : '<span class="badge badge-' + (d.state === 'approved' ? 'green' : 'red') + '">' + d.state + '</span>') +
    '</div>';
  }).join('');
}
function resolveDecision(idx, state) {
  decisions[idx].state = state;
  renderDecisions();
  addLog('Decision "' + decisions[idx].title + '" ' + state);
}

// Logging
function addLog(msg) {
  const area = document.getElementById('logArea');
  const ts = new Date().toLocaleTimeString('ko-KR');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = '<span class="log-ts">' + ts + '</span><span>' + msg + '</span>';
  if (area.firstChild?.className !== 'log-entry') area.innerHTML = '';
  area.prepend(entry);
  if (area.children.length > 100) area.lastChild.remove();
}

// Persona avatars by category
const avatars = { business:'💼', philosopher:'🤔', engineer:'⚙️', customer:'👤' };
const catColors = { business:'blue', philosopher:'purple', engineer:'green', customer:'pink' };

// Tool groups info
const toolGroupInfo = {
  core: { icon: '⚡', desc: 'Core system tools' },
  task: { icon: '📋', desc: 'Task management' },
  model: { icon: '🤖', desc: 'Model selection' },
  memory: { icon: '📝', desc: 'Obsidian memory' },
  persona: { icon: '🎭', desc: 'Persona system' },
  workflow: { icon: '🔄', desc: 'Workflow engine' },
  advisory: { icon: '💡', desc: 'Advisory modules' },
  grounding: { icon: '📊', desc: 'Data grounding' },
};

let lastData = null;

function updateDashboard(data) {
  lastData = data;

  // Status badge
  const badge = document.getElementById('statusBadge');
  badge.className = 'badge badge-green';
  badge.innerHTML = '<span class="pulse">●</span> Running';

  // KPIs
  document.getElementById('kpiStatus').textContent = '✅ Online';
  document.getElementById('kpiVersion').textContent = 'v' + (data.version || '?');

  // Ollama
  const ollama = data.modules?.ollama;
  if (ollama?.available) {
    document.getElementById('kpiOllama').textContent = '✅ Online';
    const models = ollama.models || [];
    document.getElementById('kpiOllamaModels').textContent = models.length + ' models';
  } else {
    document.getElementById('kpiOllama').textContent = '⚠️ Offline';
    document.getElementById('kpiOllamaModels').textContent = '';
  }

  // Active task
  document.getElementById('kpiTask').textContent =
    data.activeTask ? data.activeTask.title : 'No active task';

  // Task queue
  const queue = data.taskQueue || [];
  document.getElementById('kpiQueue').textContent = queue.length;
  const highPri = queue.filter(t => t.priority === 'high' || t.priority === 'critical').length;
  document.getElementById('kpiQueueSub').textContent = highPri ? highPri + ' high priority' : '';

  // Dashboard queue list
  const queueEl = document.getElementById('dashboardQueue');
  if (queue.length === 0) {
    queueEl.innerHTML = '<div style="color:var(--text-secondary);font-size:0.8125rem;padding:1rem;text-align:center">No tasks in queue</div>';
  } else {
    queueEl.innerHTML = queue.map(t => {
      const priClass = t.priority === 'high' ? 'priority-high' : t.priority === 'critical' ? 'priority-high' : t.priority === 'normal' ? 'priority-normal' : 'priority-low';
      return '<div class="kanban-card"><span class="priority ' + priClass + '"></span>' + t.title + ' <span style="color:var(--text-secondary);font-size:0.625rem">(' + t.status + ')</span></div>';
    }).join('');
  }

  // Tool groups
  const toolGroups = data.toolGroups || {};
  let totalEnabled = 0, totalDisabled = 0;
  const groupsHtml = Object.entries(toolGroups).map(([name, group]) => {
    const info = toolGroupInfo[name] || { icon: '📦', desc: name };
    const enabled = group.enabled || [];
    const disabled = group.disabled || [];
    totalEnabled += enabled.length;
    totalDisabled += disabled.length;
    const allEnabled = disabled.length === 0;
    return '<div class="tool-group">' +
      '<div class="tool-group-header">' +
        '<span class="tool-group-name">' + info.icon + ' ' + name + '</span>' +
        '<span class="badge ' + (allEnabled ? 'badge-green' : 'badge-orange') + '">' +
          enabled.length + '/' + (enabled.length + disabled.length) +
        '</span>' +
      '</div>' +
      '<div>' +
        enabled.map(t => '<span class="tool-chip tool-enabled">' + t + '</span>').join('') +
        disabled.map(t => '<span class="tool-chip tool-disabled">' + t + '</span>').join('') +
      '</div>' +
    '</div>';
  }).join('');
  document.getElementById('toolGroupsGrid').innerHTML = groupsHtml;
  document.getElementById('kpiTools').textContent = totalEnabled;
  document.getElementById('kpiToolsSub').textContent = totalDisabled ? totalDisabled + ' disabled' : 'all enabled';

  // Kanban board
  const stageMap = { queued: 'queued', active: 'understand', running: 'prototype', validating: 'validate', evolving: 'evolve', completed: 'report' };
  document.querySelectorAll('.kanban-items').forEach(el => el.innerHTML = '');
  queue.forEach(t => {
    const stage = stageMap[t.status] || 'queued';
    const col = document.querySelector('.kanban-items[data-stage="' + stage + '"]');
    if (col) {
      const priClass = t.priority === 'high' ? 'priority-high' : t.priority === 'normal' ? 'priority-normal' : 'priority-low';
      col.innerHTML += '<div class="kanban-card"><span class="priority ' + priClass + '"></span>' + t.title + '</div>';
    }
  });
  if (data.activeTask) {
    const activeCol = document.querySelector('.kanban-items[data-stage="understand"]');
    if (activeCol) {
      activeCol.innerHTML += '<div class="kanban-card" style="border-color:var(--accent)"><span class="priority priority-high"></span>🔥 ' + data.activeTask.title + '</div>';
    }
  }

  // Personas
  const personas = data.personas || {};
  let personaCount = 0;
  const categories = Object.keys(personas);
  const personaHtml = categories.map(cat => {
    const members = personas[cat] || [];
    personaCount += members.length;
    return members.map(name => {
      const avatar = avatars[cat] || '🤖';
      const color = catColors[cat] || 'blue';
      const displayName = name.split('(')[0].trim();
      const descMatch = name.match(/\((.+)\)/);
      const desc = descMatch ? descMatch[1] : '';
      return '<div class="persona-card">' +
        '<div class="persona-avatar">' + avatar + '</div>' +
        '<div class="persona-name">' + displayName + '</div>' +
        '<span class="badge badge-' + color + '" style="margin-top:0.375rem">' + cat + '</span>' +
        (desc ? '<div style="font-size:0.6875rem;color:var(--text-secondary);margin-top:0.25rem">' + desc + '</div>' : '') +
      '</div>';
    }).join('');
  }).join('');
  document.getElementById('personaGrid').innerHTML = personaHtml || '<div style="color:var(--text-secondary);text-align:center;padding:2rem">No personas loaded</div>';
  document.getElementById('kpiPersonas').textContent = personaCount;
  document.getElementById('kpiPersonasSub').textContent = categories.length + ' categories';

  addLog('Status updated: v' + data.version + ', ' + totalEnabled + ' tools, ' + queue.length + ' tasks');

  // Settings panel
  const ollamaEl = document.getElementById('settingOllamaStatus');
  if (ollamaEl) {
    ollamaEl.textContent = data.ollamaStatus || '—';
    document.getElementById('settingOllamaUrl').textContent = 'http://localhost:11434';
    const models = data.ollamaModels || [];
    document.getElementById('settingModelList').innerHTML = models.length
      ? models.map(m => '<span class="tool-chip tool-enabled">' + m + '</span>').join('')
      : '<span style="color:var(--text-secondary)">No models available</span>';
    document.getElementById('settingVaultPath').textContent = data.vaultPath || 'Not configured';
  }

  // Decision Inbox
  if (data.decisions && data.decisions.length > 0) {
    decisions = data.decisions;
    renderDecisions();
  }
}

// SSE connection
const evtSource = new EventSource('/events');
evtSource.onmessage = (e) => {
  try { updateDashboard(JSON.parse(e.data)); } catch {}
};
evtSource.onerror = () => {
  document.getElementById('statusBadge').className = 'badge badge-red';
  document.getElementById('statusBadge').innerHTML = '● Disconnected';
  addLog('Connection lost');
};

addLog('Dashboard loaded');
renderDecisions();
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

      // Send initial status with tool groups
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

    // Terminal action endpoints
    if (url?.startsWith('/api/action/') && req.method === 'POST') {
      const action = url.split('/').pop() || '';
      const allowedActions: Record<string, string> = {
        build: 'npm run build',
        test: 'npm test',
        lint: 'npx tsc --noEmit',
      };
      const cmd = allowedActions[action];
      if (!cmd) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Unknown action: ' + action }));
        return;
      }
      try {
        const { execSync } = await import('child_process');
        const output = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', timeout: 60000 });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, action, output: output.slice(-500) }));
      } catch (err: any) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, action, error: err.stderr?.slice(-500) || err.message }));
      }
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
