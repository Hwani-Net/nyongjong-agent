// Claw Visual Bridge — sends visual-only status updates to Claw Empire office UI
// This module does NOT touch Claw's internal DB, tasks, or sessions.
// It only pushes WebSocket events for UI animation via the /api/visual-bridge endpoint.

import { createLogger } from '../utils/logger.js';

const log = createLogger('claw-bridge');

const CLAW_BASE_URL = process.env.CLAW_BRIDGE_URL || 'http://127.0.0.1:8790';

// Maps 뇽죵이 workflow stages to Claw agent department roles
// This will be resolved dynamically via /api/visual-bridge/agents
interface ClawAgent {
  id: string;
  name: string;
  name_ko: string;
  role: string;
  department_id: string;
  dept_name: string;
}

// Stage → which departments are active
const STAGE_DEPARTMENT_MAP: Record<string, string[]> = {
  understanding:  ['planning'],     // 기획팀
  gate0:          ['planning'],     // 기획팀 (사업성 검토)
  gate1:          ['planning'],     // 기획팀 (PRD 심사)
  prototyping:    ['development', 'design'],  // 개발팀 + 디자인팀
  validating:     ['qa', 'development'],      // 품질관리팀 + 개발팀
  evolving:       ['development', 'infra'],   // 개발팀 + 인프라보안팀
  reporting:      ['operations', 'planning'], // 운영팀 + 기획팀
};

let agentCache: ClawAgent[] | null = null;
let lastHealthCheck = 0;
let isClawAvailable = false;

/**
 * Check if Claw server is reachable.
 */
async function checkClawHealth(): Promise<boolean> {
  const now = Date.now();
  // Cache health check for 30 seconds
  if (now - lastHealthCheck < 30_000) return isClawAvailable;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${CLAW_BASE_URL}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    isClawAvailable = res.ok;
  } catch {
    isClawAvailable = false;
  }
  lastHealthCheck = now;
  return isClawAvailable;
}

/**
 * Fetch Claw agent list (cached).
 */
async function getClawAgents(): Promise<ClawAgent[]> {
  if (agentCache) return agentCache;

  try {
    const res = await fetch(`${CLAW_BASE_URL}/api/visual-bridge/agents`);
    if (!res.ok) return [];
    const data = await res.json() as { ok: boolean; agents: ClawAgent[] };
    agentCache = data.agents || [];
    return agentCache;
  } catch {
    return [];
  }
}

/**
 * Find agents that belong to given departments.
 */
function findAgentsByDepartments(agents: ClawAgent[], deptNames: string[]): ClawAgent[] {
  return agents.filter(a => {
    const deptLower = (a.dept_name || '').toLowerCase();
    return deptNames.some(d => deptLower.includes(d));
  });
}

/**
 * Send visual status update to Claw for specific agents.
 */
async function sendVisualUpdate(
  agentId: string,
  status: 'working' | 'idle',
  taskTitle?: string,
  stage?: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${CLAW_BASE_URL}/api/visual-bridge/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, status, taskTitle, stage }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send batch visual updates.
 */
async function sendBatchUpdate(
  events: Array<{ agentId: string; status: string; taskTitle?: string; stage?: string }>,
): Promise<boolean> {
  try {
    const res = await fetch(`${CLAW_BASE_URL}/api/visual-bridge/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Main function: Notify Claw about a workflow stage change.
 * Called by CycleRunner when stage transitions occur.
 */
export async function notifyClawStageChange(
  stage: string,
  taskTitle: string,
): Promise<void> {
  // Quick check — don't block workflow if Claw is down
  const available = await checkClawHealth();
  if (!available) {
    log.debug(`Claw not available, skipping visual update for stage: ${stage}`);
    return;
  }

  const agents = await getClawAgents();
  if (agents.length === 0) {
    log.debug('No Claw agents found, skipping');
    return;
  }

  // Determine which departments should be "working"
  const activeDepts = STAGE_DEPARTMENT_MAP[stage] || [];

  // Build batch: active agents → working, others → idle
  const activeAgents = findAgentsByDepartments(agents, activeDepts);
  const idleAgents = agents.filter(a => !activeAgents.some(aa => aa.id === a.id));

  const events = [
    ...activeAgents.map(a => ({
      agentId: a.id,
      status: 'working' as const,
      taskTitle,
      stage,
    })),
    ...idleAgents.map(a => ({
      agentId: a.id,
      status: 'idle' as const,
      stage,
    })),
  ];

  const ok = await sendBatchUpdate(events);
  if (ok) {
    const activeNames = activeAgents.map(a => a.name_ko || a.name).join(', ');
    log.info(`Visual update sent: stage=${stage}, active=[${activeNames}]`);
  } else {
    log.warn(`Visual update failed for stage: ${stage}`);
  }
}

/**
 * Notify Claw that the workflow is complete (all agents idle).
 */
export async function notifyClawComplete(taskTitle: string): Promise<void> {
  const available = await checkClawHealth();
  if (!available) return;

  const agents = await getClawAgents();
  if (agents.length === 0) return;

  const events = agents.map(a => ({
    agentId: a.id,
    status: 'idle' as const,
    taskTitle,
    stage: 'complete',
  }));

  await sendBatchUpdate(events);
  log.info(`All agents set to idle (workflow complete: "${taskTitle.slice(0, 50)}")`);
}

/**
 * Clear agent cache (e.g., when Claw restarts).
 */
export function clearClawAgentCache(): void {
  agentCache = null;
  lastHealthCheck = 0;
  isClawAvailable = false;
}
