// Dashboard HTTP server — Phase 4 full dashboard with kanban, personas, tool groups
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { createLogger, getErrorLog, clearErrorLog } from '../utils/logger.js';
import { type AppConfig } from '../core/config.js';
import { initializeAgent, getAgentStatus } from '../agent.js';
import { analyzeGoal } from '../workflow/understand.js';
import { recordGateDecision, getGateHistory, getLastGate, getLastPRD, type GateHistoryEntry } from '../core/shared-state.js';

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
.typing-dots { animation: typingPulse 1.2s ease-in-out infinite; color: var(--text-secondary); }
@keyframes typingPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.chat-bubble.typing { background: var(--surface-alt); border: 1px dashed var(--border); }

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
/* Stage-Gate styles */
.sg-stage {
  flex: 1; padding: 0.5rem 0.25rem; text-align: center;
  background: var(--surface-alt); border-right: 1px solid var(--border);
  font-size: 0.6875rem; font-weight: 600; color: var(--text-secondary);
  transition: all 0.3s;
}
.sg-stage:last-child { border-right: none; }
.sg-stage span { font-size: 0.625rem; font-weight: 400; }
.sg-stage.sg-done { background: var(--green-light); color: var(--green); }
.sg-stage.sg-active { background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; }
.sg-stage.sg-pending { opacity: 0.45; }
.sg-review-card {
  background: var(--surface-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 0.75rem; margin-bottom: 0.5rem;
  display: flex; align-items: flex-start; gap: 0.5rem;
}
.adapter-card {
  background: var(--surface-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 0.625rem 0.875rem;
  font-size: 0.8125rem; font-weight: 600;
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
}
.adapter-card.adapter-ok { border-left: 3px solid var(--green); }
.adapter-card.adapter-off { border-left: 3px solid var(--red); opacity: 0.7; }
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
      <div class="nav-item" data-page="stage-gate" onclick="showPage('stage-gate')">
        <span class="icon">🔀</span> Stage-Gate
      </div>
      <div class="nav-item" data-page="cache-stats" onclick="showPage('cache-stats')">
        <span class="icon">📦</span> Cache Stats
      </div>
    </nav>
    <div class="sidebar-footer">
      <span style="font-size:0.75rem; color:var(--text-secondary)">v0.4.1</span>
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

      <!-- Stage-Gate Monitor -->
      <div class="page" id="page-stage-gate">
        <div class="fade-in">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:0.5rem">
            <div style="display:flex;align-items:center;gap:0.75rem">
              <span id="sgLlmBadge" class="badge badge-green">🤖 LLM Mode</span>
              <span id="sgLastUpdate" style="font-size:0.75rem;color:var(--text-secondary)">업데이트 대기 중...</span>
            </div>
            <button class="btn" onclick="refreshStageGate()">🔄 새로고침</button>
          </div>
          <div class="kpi-card section" style="border-left:4px solid var(--blue)">
            <div class="section-title">⚡ 활성 워크플로우</div>
            <div id="sgActiveGoal" style="font-size:0.9375rem;font-weight:700;margin-bottom:1rem;color:var(--text)">현재 활성 태스크가 없습니다</div>
            <div style="display:flex;gap:0;border-radius:8px;overflow:hidden;margin-bottom:0.75rem">
              <div id="sgStageGate0" class="sg-stage" data-stage="gate0">Gate 0<br><span>Business</span></div>
              <div id="sgStageGate1" class="sg-stage" data-stage="gate1">Gate 1<br><span>PRD</span></div>
              <div id="sgStageDesign" class="sg-stage" data-stage="design">Design</div>
              <div id="sgStageCode" class="sg-stage" data-stage="code">Code</div>
              <div id="sgStageDone" class="sg-stage" data-stage="done">✅ Done</div>
            </div>
            <div id="sgRoundBadge" class="badge badge-purple" style="font-size:0.6875rem">⏳ 대기 중</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="kpi-card">
              <div class="section-title">💼 Gate 0 — 사업성 검토</div>
              <div id="sgBusinessReviews"><div style="padding:1rem;text-align:center;color:var(--text-secondary);font-size:0.8125rem">검토 결과 없음</div></div>
              <div id="sgGroundingBadge" style="margin-top:0.75rem;display:none"><span class="badge badge-blue">📊 시장 데이터 자동 주입됨</span></div>
            </div>
            <div class="kpi-card">
              <div class="section-title">📄 Gate 1 — PRD 커스토머 심사</div>
              <div id="sgPRDPanel"><div style="padding:1rem;text-align:center;color:var(--text-secondary);font-size:0.8125rem">PRD 없음</div></div>
            </div>
          </div>
          <div class="kpi-card section" style="margin-top:1rem">
            <div class="section-title">📜 최근 게이트 이력</div>
            <div id="sgHistory"><div style="padding:1rem;text-align:center;color:var(--text-secondary);font-size:0.8125rem">이력 없음</div></div>
          </div>
        </div>
      </div>

      <!-- Cache Stats -->
      <div class="page" id="page-cache-stats">
        <div class="fade-in">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
            <span id="csLastRefresh" style="font-size:0.75rem;color:var(--text-secondary)">마지막 갱신: 대기 중</span>
            <button class="btn" onclick="refreshCacheStats()">🔄 Refresh</button>
          </div>
          <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
            <div class="kpi-card"><div class="kpi-label">캐시 히트율</div><div class="kpi-value" id="csHitRate" style="color:var(--green)">—</div></div>
            <div class="kpi-card"><div class="kpi-label">MCP Tools</div><div class="kpi-value" id="csMcpCount" style="color:var(--blue)">—</div><div class="kpi-sub">활성화됨</div></div>
            <div class="kpi-card"><div class="kpi-label">업타임 Uptime</div><div class="kpi-value" id="csUptime" style="color:var(--accent)">—</div></div>
            <div class="kpi-card"><div class="kpi-label">Gate 역사</div><div class="kpi-value" id="csGateCount" style="color:var(--text-secondary)">—</div><div class="kpi-sub">누적 게이트</div></div>
          </div>
          <div class="kpi-card section">
            <div class="section-title">🌐 Grounding Adapter Status</div>
            <div id="csAdapters" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.75rem">
              <div class="adapter-card" id="adapterKOSIS">KOSIS <span class="badge badge-orange">확인 중</span></div>
              <div class="adapter-card" id="adapterNaver">Naver <span class="badge badge-orange">확인 중</span></div>
              <div class="adapter-card" id="adapterTrends">Trends <span class="badge badge-orange">확인 중</span></div>
              <div class="adapter-card" id="adapterLaw">Law KR <span class="badge badge-orange">확인 중</span></div>
              <div class="adapter-card" id="adapterReviews">App Reviews <span class="badge badge-orange">확인 중</span></div>
              <div class="adapter-card" id="adapterScraper">Scraper <span class="badge badge-green">✅ Ready</span></div>
            </div>
          </div>
          <div class="kpi-card section">
            <div class="section-title">🔧 MCP Tools</div>
            <div id="csMcpTools" style="display:flex;flex-wrap:wrap;gap:0.375rem"></div>
          </div>
          <div class="kpi-card section">
            <div class="section-title">📜 Gate 실행 이력 (Server Memory)</div>
            <div id="csGateLog" style="font-size:0.75rem;max-height:200px;overflow-y:auto">
              <div style="padding:1rem;text-align:center;color:var(--text-secondary)">없음</div>
            </div>
          </div>
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
  const titles = { dashboard:'📊 Dashboard', kanban:'📋 Kanban', tools:'🔧 Tools', personas:'🎭 Personas', chat:'💬 Chat', office:'🎮 Office', terminal:'🖥️ Terminal', inbox:'📨 Decision Inbox', settings:'⚙️ Settings', logs:'📝 Event Log', 'stage-gate':'🔀 Stage-Gate Monitor', 'cache-stats':'📦 Cache Stats' };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  if (page === 'office') renderOffice();
  if (page === 'stage-gate') refreshStageGate();
  if (page === 'cache-stats') refreshCacheStats();
}

// Chat panel
async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addChatBubble(msg, 'user', '👤 대표님');
  const typing = document.createElement('div');
  typing.className = 'chat-bubble agent typing';
  typing.innerHTML = '<div class="sender">🐾 뇽죵이</div><span class="typing-dots">●●●</span>';
  document.getElementById('chatMessages').appendChild(typing);
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    });
    const data = await resp.json();
    typing.remove();
    addChatBubble(data.reply || '응답을 생성하지 못했습니다.', 'agent', '🐾 뇽죵이');
    if (data.action) addLog('Chat action: ' + data.action);
  } catch {
    typing.remove();
    addChatBubble('서버 연결에 실패했습니다. 다시 시도해주세요. 🔌', 'agent', '🐾 뇽죵이');
  }
}
function addChatBubble(text, role, sender) {
  const area = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-bubble ' + role;
  div.innerHTML = '<div class="sender">' + sender + '</div>' + text;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

// Office view — syncs with SSE persona data
let officeDesks = [
  { emoji: '🐾', name: '뇽죵이', role: 'CEO Agent', status: 'active' },
  { emoji: '💼', name: 'CEO Naedon', role: 'Business', status: 'idle' },
  { emoji: '🤔', name: 'Philosopher', role: 'Advisor', status: 'idle' },
  { emoji: '⚙️', name: 'Engineer', role: 'Technical', status: 'idle' },
  { emoji: '🔒', name: 'Auditor', role: 'Security', status: 'idle' },
  { emoji: '👤', name: 'User Advocate', role: 'Customer', status: 'idle' },
];
function updateOfficeFromSSE(data) {
  const stage = data.activeTask?.stage || '';
  const stagePersonaMap = {
    understand: ['CEO Naedon', 'User Advocate', 'Philosopher'],
    prototype: ['Engineer'],
    validate: ['Engineer', 'Auditor', 'User Advocate'],
    evolve: ['Engineer', 'Auditor', 'Philosopher'],
    report: ['CEO Naedon'],
  };
  const activeNames = stagePersonaMap[stage] || [];
  officeDesks.forEach(d => {
    d.status = d.name === '뇽죵이' ? 'active' : (activeNames.includes(d.name) ? 'active' : 'idle');
  });
}
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
  }).join('<br>');
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
        '<button class="btn btn-accent" onclick="resolveDecision(' + i + ',&apos;approved&apos;)">✅ Approve</button>' +
        '<button class="btn" onclick="resolveDecision(' + i + ',&apos;rejected&apos;)">❌ Reject</button>' +
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

// Immediate data load — don't wait for SSE
(async function loadInitialData() {
  try {
    const resp = await fetch('/api/status');
    const data = await resp.json();
    updateDashboard(data);
    updateOfficeFromSSE(data);
    document.getElementById('statusBadge').className = 'badge badge-green';
    document.getElementById('statusBadge').innerHTML = '<span class="pulse">●</span> Connected';
    addLog('Initial data loaded via fetch');
  } catch (e) {
    addLog('Initial fetch failed: ' + e.message);
  }
})();

// SSE connection for real-time updates
let sseRetryCount = 0;
function connectSSE() {
  const evtSource = new EventSource('/events');
  evtSource.onopen = () => {
    sseRetryCount = 0;
    document.getElementById('statusBadge').className = 'badge badge-green';
    document.getElementById('statusBadge').innerHTML = '<span class="pulse">●</span> Connected';
    addLog('SSE connected');
  };
  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'ping') return; // ignore keepalive
      updateDashboard(data);
      updateOfficeFromSSE(data);
      if (document.querySelector('[data-page="office"].active')) renderOffice();
      document.getElementById('statusBadge').className = 'badge badge-green';
      document.getElementById('statusBadge').innerHTML = '<span class="pulse">●</span> Connected';
    } catch (err) {
      addLog('SSE parse error: ' + err.message);
    }
  };
  evtSource.onerror = () => {
    sseRetryCount++;
    document.getElementById('statusBadge').className = 'badge badge-orange';
    document.getElementById('statusBadge').innerHTML = '● Reconnecting...';
    addLog('SSE disconnected — retry #' + sseRetryCount);
    if (sseRetryCount > 5) {
      evtSource.close();
      addLog('SSE failed after 5 retries — falling back to polling');
      startPolling();
    }
  };
}
connectSSE();

// Fallback polling if SSE fails
let pollingInterval = null;
function startPolling() {
  if (pollingInterval) return;
  pollingInterval = setInterval(async () => {
    try {
      const resp = await fetch('/api/status');
      const data = await resp.json();
      updateDashboard(data);
      document.getElementById('statusBadge').className = 'badge badge-blue';
      document.getElementById('statusBadge').innerHTML = '● Polling';
    } catch {}
  }, 5000);
}

addLog('Dashboard v0.4.1 — Stage-Gate + Cache Stats 적용');
renderDecisions();

// ────── Stage-Gate Monitor ──────
async function refreshStageGate() {
  document.getElementById('sgLastUpdate').textContent = '갱신 중...';
  try {
    const resp = await fetch('/api/status');
    const data = await resp.json();
    const llmOk = data.ollama?.available;
    const badge = document.getElementById('sgLlmBadge');
    badge.className = 'badge ' + (llmOk ? 'badge-green' : 'badge-orange');
    badge.textContent = llmOk ? '🤖 LLM Mode' : '⚙️ Heuristic Mode';
    const task = data.activeTask;
    document.getElementById('sgActiveGoal').textContent = task ? task.title : '현재 활성 태스크가 없습니다';
    const stageMap = { understand:'gate0', prototype:'gate1', validate:'gate1', evolve:'code', report:'done' };
    const currentStage = task ? stageMap[task.stage || task.status] : null;
    const stages = [
      { id: 'sgStageGate0', key: 'gate0' },
      { id: 'sgStageGate1', key: 'gate1' },
      { id: 'sgStageDesign', key: 'design' },
      { id: 'sgStageCode', key: 'code' },
      { id: 'sgStageDone', key: 'done' },
    ];
    const order = stages.map(s => s.key);
    const idx = order.indexOf(currentStage);
    stages.forEach((s, i) => {
      const el = document.getElementById(s.id);
      if (!el) return;
      el.className = 'sg-stage';
      if (idx >= 0 && i < idx) el.classList.add('sg-done');
      else if (i === idx) el.classList.add('sg-active');
      else el.classList.add('sg-pending');
    });
    document.getElementById('sgRoundBadge').textContent = task ? task.status : '⏳ 대기 중';
    document.getElementById('sgLastUpdate').textContent = '방금 전 업데이트';
    // Gate history from /api/gate-history
    try {
      const ghResp = await fetch('/api/gate-history');
      const gh = await ghResp.json();
      const histEl = document.getElementById('sgHistory');
      if (gh.length > 0) {
        histEl.innerHTML = gh.slice(0,5).map(h =>
          '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;border-bottom:1px solid var(--border);font-size:0.8125rem">' +
          '<span class="badge ' + (h.verdict==='PASS'?'badge-green':h.verdict==='PIVOT'?'badge-orange':'badge-red') + '">' + h.verdict + '</span>' +
          '<span style="flex:1">' + h.goal.slice(0,55) + '</span>' +
          '<span style="color:var(--text-secondary);font-size:0.6875rem">' + h.time + '</span></div>'
        ).join('');
      }
    } catch {}
  } catch {
    document.getElementById('sgLastUpdate').textContent = '연결 실패';
  }
}

// ────── Cache Stats ──────
const adapterDefs = [
  { id: 'adapterKOSIS',   name: 'KOSIS',   key: 'KOSIS_API_KEY' },
  { id: 'adapterNaver',   name: 'Naver',   key: 'NAVER_CLIENT_ID' },
  { id: 'adapterTrends',  name: 'Trends',  key: null },
  { id: 'adapterLaw',     name: 'Law KR',  key: null },
  { id: 'adapterReviews', name: 'Reviews', key: 'APP_REVIEWS_KEY' },
  { id: 'adapterScraper', name: 'Scraper', key: null },
];
async function refreshCacheStats() {
  document.getElementById('csLastRefresh').textContent = '마지막 갱신: ' + new Date().toLocaleTimeString('ko-KR');
  try {
    const resp = await fetch('/api/status');
    const data = await resp.json();
    // KPIs
    const tools = data.tools || [];
    document.getElementById('csMcpCount').textContent = tools.filter(t => t.enabled).length;
    document.getElementById('csHitRate').textContent = '—'; // 실서버 연동 예정
    document.getElementById('csUptime').textContent = '✔ Running';
    // Gate count
    try {
      const ghR = await fetch('/api/gate-history');
      const gh = await ghR.json();
      document.getElementById('csGateCount').textContent = gh.length;
      const logEl = document.getElementById('csGateLog');
      if (gh.length > 0) {
        logEl.innerHTML = gh.map(h =>
          '<div style="display:flex;gap:0.5rem;padding:0.375rem 0;border-bottom:1px solid var(--border)">' +
          '<span class="badge ' + (h.verdict==='PASS'?'badge-green':h.verdict==='PIVOT'?'badge-orange':'badge-red') + '">' + h.verdict + '</span>' +
          '<span style="flex:1">' + h.goal.slice(0,50) + '</span>' +
          '<span style="color:var(--text-secondary)">' + h.time + '</span></div>'
        ).join('');
      } else {
        logEl.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-secondary)">현 세션에서 게이트 실행 없음</div>';
      }
    } catch {}
    // MCP tools
    const toolsEl = document.getElementById('csMcpTools');
    toolsEl.innerHTML = tools.map(t => '<span class="tool-chip ' + (t.enabled?'tool-enabled':'tool-disabled') + '">' + (t.enabled?'✅':'○') + ' ' + t.name + '</span>').join('');
    // Adapters
    const envKeys = data.envKeys || {};
    adapterDefs.forEach(a => {
      const el = document.getElementById(a.id);
      if (!el) return;
      const ok = a.key === null || !!envKeys[a.key];
      el.className = 'adapter-card ' + (ok ? 'adapter-ok' : 'adapter-off');
      el.innerHTML = a.name + ' <span class="badge ' + (ok ? 'badge-green' : 'badge-red') + '">' + (ok ? '✅ Ready' : '❌ 미설정') + '</span>';
    });
  } catch {
    document.getElementById('csHitRate').textContent = '연결 실패';
  }
}
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
  const serverStartTime = Date.now(); // for /health uptime

  // Wire CycleRunner → gateHistory (Dashboard Stage-Gate Monitor)
  (modules.cycleRunner as unknown as { options: { onGateDecision?: (g: string, v: string) => void } })
    .options.onGateDecision = (goal: string, verdict: string) => {
      recordGateDecision({
        goal,
        verdict: (verdict === 'PASS' ? 'PASS' : 'SKIP') as GateHistoryEntry['verdict'],
        taskType: 'implementation',
      });
    };

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

    // Health check endpoint — used by load balancers and monitoring tools
    if (url === '/health' || url === '/healthz') {
      const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000);

      // ── Real module health checks ──────────────────────────────────────────
      const issues: string[] = [];

      // 1. Ollama (advisory — not critical, just informational)
      const ollamaAvail = modules.ollamaClient
        ? await modules.ollamaClient.isAvailable().catch(() => false)
        : false;

      // 2. Task manager (critical — must be able to queue tasks)
      let taskQueue: Array<unknown> = [];
      let taskManagerOk = false;
      try {
        taskQueue = await modules.taskManager.getQueue();
        taskManagerOk = true;
      } catch (err) {
        issues.push(`taskManager: ${err instanceof Error ? err.message : 'unavailable'}`);
      }

      // 3. Obsidian vault (critical — must be able to read/write memory)
      let obsidianOk = false;
      try {
        const { stat } = await import('fs/promises');
        await stat(config.OBSIDIAN_VAULT_PATH);
        obsidianOk = true;
      } catch {
        issues.push(`obsidian: vault path inaccessible (${config.OBSIDIAN_VAULT_PATH})`);
      }

      // 4. Version from package.json (non-critical)
      let version = '0.4.1';
      try {
        const { readFile } = await import('fs/promises');
        const { resolve, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const __d = dirname(fileURLToPath(import.meta.url));
        const pkgJson = JSON.parse(await readFile(resolve(__d, '../../package.json'), 'utf-8')) as { version?: string };
        version = pkgJson.version ?? version;
      } catch { /* keep fallback */ }

      // ── Determine health status ────────────────────────────────────────────
      const healthy = taskManagerOk && obsidianOk;   // critical modules must be up

      const body = {
        status: healthy ? 'ok' : 'degraded',
        version,
        uptime: uptimeSec,
        timestamp: new Date().toISOString(),
        modules: {
          ollama: ollamaAvail ? 'online' : 'offline',
          taskQueue: taskQueue.length,
          sseClients: sseClients.size,
          taskManager: taskManagerOk ? 'ok' : 'error',
          obsidian: obsidianOk ? 'ok' : 'error',
        },
        env: {
          KOSIS_API_KEY: !!process.env['KOSIS_API_KEY'],
          NAVER_CLIENT_ID: !!process.env['NAVER_CLIENT_ID'],
          // law-kr, app-reviews: no API key required (public API / scraping)
        },
        ...(issues.length > 0 ? { issues } : {}),
      };
      res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body, null, 2));
      return;
    }

    // Gate history endpoints
    if (url === '/api/gate-history') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getGateHistory()));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const entry = JSON.parse(body) as Omit<GateHistoryEntry, 'time' | 'ts'>;
            recordGateDecision(entry);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, count: getGateHistory().length }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid body' }));
          }
        });
        return;
      }
    }

    // Monitoring Stack — error/warn log
    if (url === '/api/errors') {
      if (req.method === 'GET') {
        const limit = 50;
        const logs = getErrorLog().slice(0, limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ count: logs.length, logs }));
        return;
      }
      if (req.method === 'DELETE') {
        clearErrorLog();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Error log cleared' }));
        return;
      }
    }

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
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, action, error: e.stderr?.slice(-500) || e.message || 'Unknown error' }));
      }
      return;
    }

    // Chat API endpoint
    if (url === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { message } = JSON.parse(body);
          const lowerMsg = (message || '').toLowerCase();
          let reply = '';
          let action = '';

          // Smart routing based on message intent
          if (lowerMsg.includes('상태') || lowerMsg.includes('status')) {
            const status = await getAgentStatus(modules, config);
            reply = `현재 상태입니다:\n• 서버: ${status.status}\n• 도구: ${(status.enabledTools as string[] || []).length}개 활성\n• 태스크 큐: ${(status.taskQueue as unknown[] || []).length}건\n• Ollama: ${status.ollamaStatus || 'N/A'}\n• 버전: v${status.version}`;
            action = 'status_check';

          } else if (lowerMsg.includes('빌드') || lowerMsg.includes('build')) {
            // Actually run the build
            try {
              const buildResult = await modules.shellRunner.run('npm run build', process.cwd());
              if (buildResult.exitCode === 0) {
                reply = `✅ 빌드 성공! (${buildResult.durationMs}ms)\n\n${buildResult.stdout.slice(-300)}`;
              } else {
                reply = `❌ 빌드 실패 (exit code: ${buildResult.exitCode})\n\n${buildResult.stderr.slice(-500)}`;
              }
            } catch (e) {
              reply = `⚠️ 빌드 실행 중 오류: ${e instanceof Error ? e.message : String(e)}`;
            }
            action = 'build_executed';

          } else if (lowerMsg.includes('테스트') || lowerMsg.includes('test')) {
            // Actually run the tests
            try {
              const testResult = await modules.shellRunner.run('npx vitest run', process.cwd());
              if (testResult.exitCode === 0) {
                // Extract pass count from output
                const passMatch = testResult.stdout.match(/Tests\s+(\d+)\s+passed/);
                const fileMatch = testResult.stdout.match(/Test Files\s+(\d+)\s+passed/);
                const passes = passMatch?.[1] || '?';
                const files = fileMatch?.[1] || '?';
                reply = `✅ 테스트 통과! ${passes}건 / ${files}파일 (${testResult.durationMs}ms)\n\n${testResult.stdout.slice(-400)}`;
              } else {
                reply = `❌ 테스트 실패 (exit code: ${testResult.exitCode})\n\n${testResult.stderr.slice(-500)}`;
              }
            } catch (e) {
              reply = `⚠️ 테스트 실행 중 오류: ${e instanceof Error ? e.message : String(e)}`;
            }
            action = 'test_executed';

          } else if (lowerMsg.includes('분석') || lowerMsg.includes('analyze') || lowerMsg.includes('분석해')) {
            // Run actual goal analysis
            const goalText = message.replace(/분석|analyze|분석해/gi, '').trim() || message;
            const result = analyzeGoal({ goal: goalText });
            const a = result.analysis;
            reply = `🔍 목표 분석 결과:\n• 유형: ${a.taskType}\n• 복잡도: ${a.complexity}\n• 범위: ${a.scope}\n• 위험: ${a.risks?.join(', ') || '없음'}\n• 요구사항: ${a.keyRequirements?.join(', ') || '일반'}\n\n💡 다음 액션: ${result.nextAction}`;
            action = 'goal_analyzed';

          } else if (lowerMsg.includes('검증') || lowerMsg.includes('팩트') || lowerMsg.includes('ground')) {
            // Run grounding check on the message
            const textToCheck = message.replace(/검증|팩트|ground|체크/gi, '').trim() || message;
            const groundResult = await modules.groundingEngine.ground(textToCheck);
            const claimLines = groundResult.verifications.map((v: { claim: { text: string; type: string }; verified: boolean; apiResult: { source: string } }) =>
              `  ${v.verified ? '✅' : '❌'} "${v.claim.text}" (${v.claim.type}) → ${v.apiResult.source}`
            ).join('\n');
            reply = `🔎 팩트 검증 결과 (${groundResult.status}):\n• 총 주장: ${groundResult.analysis.claims.length}건\n• 검증됨: ${groundResult.verifications.filter((v: { verified: boolean }) => v.verified).length}건\n${claimLines ? '\n' + claimLines : ''}\n\n${groundResult.summary}`;
            action = 'ground_check';

          } else if (lowerMsg.includes('그라운딩') || lowerMsg.includes('어댑터') || lowerMsg.includes('adapter')) {
            // Show grounding adapter status
            const adapterStatus = modules.groundingEngine.getAdapterStatus();
            const adapterLines = Object.entries(adapterStatus).map(([name, configured]) =>
              `  ${configured ? '🟢' : '🔴'} ${name}: ${configured ? '연결됨' : '미설정'}`
            ).join('\n');
            reply = `📡 Grounding 어댑터 상태:\n${adapterLines}\n\n🟢 = API 사용 가능 | 🔴 = API 키 필요\n\n무료 어댑터: LawKR (법령정보), GoogleTrends\nAPI 키 필요: KOSIS, Naver Search`;
            action = 'adapter_status';

          } else if (lowerMsg.includes('페르소나') || lowerMsg.includes('persona')) {
            const personas = await modules.personaLoader.loadAll();
            reply = `현재 ${personas.length}개 페르소나가 등록되어 있습니다:\n${personas.map((p: { name: string; category: string }) => `• ${p.name} (${p.category})`).join('\n')}`;
            action = 'persona_list';

          } else if (lowerMsg.includes('태스크') || lowerMsg.includes('task') || lowerMsg.includes('할일')) {
            const tasks = await modules.taskManager.getQueue();
            reply = tasks.length > 0
              ? `현재 ${tasks.length}개 태스크가 있습니다:\n${tasks.slice(0, 5).map((t: { status: string; title: string }) => `• [${t.status}] ${t.title}`).join('\n')}`
              : '현재 태스크 큐가 비어 있습니다. 새 태스크를 추가해보세요! 📝';
            action = 'task_list';

          } else if (lowerMsg.includes('모델') || lowerMsg.includes('model')) {
            reply = '사용 가능한 모델 목록:\n• Gemini 3.1 Pro (High) — 복잡한 설계\n• Gemini 3.1 Pro (Low) — 구현/리팩터링\n• Gemini 3 Flash — 빠른 단순 작업\n• Claude Sonnet 4.6 — 논리적 추론\n• Claude Opus 4.6 — 최고 난이도\n• GPT-OSS 120B — 범용';
            action = 'model_list';

          } else if (lowerMsg.includes('도움') || lowerMsg.includes('help') || lowerMsg.includes('뭐')) {
            reply = '🐾 사용 가능한 명령어:\n\n📊 시스템\n• "상태" — 에이전트 상태 확인\n• "어댑터" — Grounding API 연결 상태\n\n🔨 실행\n• "빌드" — 프로젝트 빌드 실행\n• "테스트" — 유닛 테스트 실행\n\n🧠 AI\n• "분석 [목표]" — 목표 분석 (유형/복잡도)\n• "검증 [텍스트]" — 팩트 체크 (실제 API)\n\n📋 조회\n• "페르소나" — 페르소나 목록\n• "태스크" — 태스크 큐 조회\n• "모델" — AI 모델 목록';
            action = 'help';

          } else {
            reply = `"${message}" — 알겠습니다 대표님! 🤔\n\n💡 "도움"을 입력하면 사용 가능한 명령어를 확인할 수 있습니다.\n\n🔎 빠른 실행:\n• "빌드" — 즉시 빌드\n• "테스트" — 즉시 테스트\n• "검증 ${message}" — 이 텍스트 팩트 체크\n• "분석 ${message}" — 이 목표 분석`;
            action = 'general_response';
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ reply, action, timestamp: new Date().toISOString() }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ reply: '메시지 파싱에 실패했습니다.', action: 'error' }));
        }
      });
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
  }, 10_000); // 10s — persona(30s TTL cached) + ollama(30s TTL cached); no need for 5s


  server.listen(port, () => {
    log.info(`🐾 Dashboard running at http://localhost:${port}`);
  });
}
