// Shared in-memory state store — accessed by both mcp-server.ts and dashboard/server.ts
// Avoids circular imports: neither module imports the other, both import this.

export interface GateHistoryEntry {
  goal: string;
  verdict: 'PASS' | 'SKIP' | 'PIVOT' | 'ASK_HUMAN' | 'REQUIRED' | 'FAIL';
  taskType: string;
  time: string;
  ts: number;
}

export interface LastGateState {
  reviews: Array<{ personaId: string; personaName: string; verdict: string; feedback: string }>;
  hasGrounding: boolean;
  goal: string;
  verdict: string;
  ts: number;
}

export interface LastPRDState {
  version: number;
  verdicts: Array<{ round: number; status: string; issues: string[] }>;
  rounds: number;
  goal: string;
  ts: number;
}

// ── Ring buffers ──────────────────────────────────────────────────────────────
const GATE_HISTORY_MAX = 50;
const gateHistory: GateHistoryEntry[] = [];

let lastGate: LastGateState | null = null;
let lastPRD: LastPRDState | null = null;

// ── Gate History ──────────────────────────────────────────────────────────────

/**
 * Record a gate decision. Keeps newest first (max 50).
 */
export function recordGateDecision(
  entry: Omit<GateHistoryEntry, 'time' | 'ts'>,
): void {
  gateHistory.unshift({
    ...entry,
    time: new Date().toLocaleTimeString('ko-KR'),
    ts: Date.now(),
  });
  if (gateHistory.length > GATE_HISTORY_MAX) gateHistory.pop();
}

/**
 * Get the full gate history (read-only copy).
 */
export function getGateHistory(): GateHistoryEntry[] {
  return [...gateHistory];
}

/**
 * Clear gate history — primarily for E2E test isolation.
 */
export function clearGateHistory(): void {
  gateHistory.length = 0;
}

// ── Last Gate & PRD snapshot ──────────────────────────────────────────────────

export function setLastGate(state: LastGateState): void {
  lastGate = state;
}

export function getLastGate(): LastGateState | null {
  return lastGate;
}

export function setLastPRD(state: LastPRDState): void {
  lastPRD = state;
}

export function getLastPRD(): LastPRDState | null {
  return lastPRD;
}

// ── Skill Usage Metrics ──────────────────────────────────────────────────────

export interface SkillUsageEntry {
  skillName: string;
  category: 'capability' | 'workflow';
  tokens: number;
  durationMs: number;
  success: boolean;
  ts: number;
}

const SKILL_USAGE_MAX = 200;
const skillUsageHistory: SkillUsageEntry[] = [];

/**
 * Record a skill usage event. Keeps newest first (max 200).
 */
export function recordSkillUsage(entry: Omit<SkillUsageEntry, 'ts'>): void {
  skillUsageHistory.unshift({
    ...entry,
    ts: Date.now(),
  });
  if (skillUsageHistory.length > SKILL_USAGE_MAX) skillUsageHistory.pop();
}

/**
 * Get the full skill usage history (read-only copy).
 */
export function getSkillUsageHistory(): SkillUsageEntry[] {
  return [...skillUsageHistory];
}

/**
 * Clear skill usage history — primarily for test isolation.
 */
export function clearSkillUsageHistory(): void {
  skillUsageHistory.length = 0;
}
